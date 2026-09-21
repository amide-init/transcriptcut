#!/usr/bin/env bash
#
# One-shot setup for running this project on macOS: installs Node/pnpm/
# ffmpeg-full via Homebrew if missing, installs JS deps, generates the
# Prisma client, and creates client/.env (with FFMPEG_PATH pre-filled and
# an interactive OPENAI_API_KEY prompt) if one doesn't already exist.
#
# Safe to re-run -- every step checks before it acts, and an existing
# client/.env is never overwritten.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$REPO_ROOT/client"

step() { printf '\n==> %s\n' "$1"; }

# Replaces the (whole-line) $2 with $3 in file $1, as an exact literal
# line match via awk -- not sed (would need regex escaping for the `/` and
# `"` in a path/key) and not bash's ${var/pattern/replacement} (tried
# first, but macOS ships bash 3.2 -- Apple has never upgraded it, over
# GPLv3 licensing -- and its parameter-substitution pattern matching has
# real quoting/anchoring quirks: quoting $pattern/$replacement inserted
# literal quote characters into the result, and unquoting that broke
# matching for any pattern starting with '#', both verified reproducing
# on this exact bash 3.2 and not on bash 4+). awk's -v passes strings
# through literally, with no glob/regex reinterpretation either way.
set_env_var() {
  local file="$1" pattern="$2" replacement="$3"
  awk -v pat="$pattern" -v rep="$replacement" '
    $0 == pat { print rep; next }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

step "Checking you're on macOS"
if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is macOS-only. See CONTRIBUTING.md for the manual setup steps on other platforms."
  exit 1
fi

step "Checking for Homebrew"
if ! command -v brew &>/dev/null; then
  cat <<'EOF'
Homebrew isn't installed. Install it first (see https://brew.sh), then re-run this script:

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
EOF
  exit 1
fi
echo "Found Homebrew."

step "Checking for Node 20+"
if command -v node &>/dev/null; then
  node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$node_major" -lt 20 ]; then
    echo "Found Node $(node -v), but 20+ is required. Upgrade it (e.g. 'brew upgrade node') and re-run this script."
    exit 1
  fi
  echo "Found Node $(node -v)."
else
  echo "Installing Node via Homebrew..."
  brew install node
fi

step "Checking for pnpm"
if command -v pnpm &>/dev/null; then
  echo "Found pnpm $(pnpm -v)."
else
  echo "Installing pnpm via Homebrew..."
  brew install pnpm
fi

step "Checking ffmpeg has subtitle burn-in (libass) support"
ffmpeg_path_override=""
if command -v ffmpeg &>/dev/null && ffmpeg -filters 2>/dev/null | grep -qw subtitles; then
  echo "Default ffmpeg already supports subtitles -- nothing to do."
else
  echo "Default ffmpeg is missing or lacks libass support (needed for 'Burn in captions')."
  echo "Installing ffmpeg-full via Homebrew..."
  brew install ffmpeg-full
  # ffmpeg-full is keg-only (its ffmpeg/ffprobe binaries conflict with the
  # plain ffmpeg formula's), so it's never on PATH -- the app needs the
  # explicit path via FFMPEG_PATH, filled into .env below. brew --prefix
  # resolves correctly on both Apple Silicon (/opt/homebrew) and Intel
  # (/usr/local), unlike a hardcoded path.
  ffmpeg_path_override="$(brew --prefix ffmpeg-full)/bin/ffmpeg"
fi

step "Installing JS dependencies"
(cd "$CLIENT_DIR" && pnpm install)

step "Generating the Prisma client"
(cd "$CLIENT_DIR" && pnpm exec prisma generate)

step "Setting up client/.env"
env_file="$CLIENT_DIR/.env"
if [ -f "$env_file" ]; then
  echo "client/.env already exists -- leaving it as-is."
else
  cp "$CLIENT_DIR/.env.example" "$env_file"
  echo "Created client/.env from .env.example."

  if [ -n "$ffmpeg_path_override" ]; then
    set_env_var "$env_file" \
      '# FFMPEG_PATH="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"' \
      "FFMPEG_PATH=\"$ffmpeg_path_override\""
    echo "Set FFMPEG_PATH to the Homebrew ffmpeg-full binary (fixes caption burn-in)."
  fi

  openai_key_input=""
  read -rsp "Paste your OpenAI API key (used server-side only; Enter to skip and edit client/.env by hand later): " openai_key_input || true
  echo
  if [ -n "$openai_key_input" ]; then
    set_env_var "$env_file" "OPENAI_API_KEY=sk-..." "OPENAI_API_KEY=$openai_key_input"
    echo "Set OPENAI_API_KEY in client/.env."
  else
    echo "Skipped -- transcription and AI features won't work until you set OPENAI_API_KEY in client/.env."
  fi
fi

step "Done"
cat <<EOF
Next:

  cd client
  pnpm run dev

Then open http://localhost:3000
EOF
