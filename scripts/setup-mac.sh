#!/usr/bin/env bash
#
# One-shot setup for running this project on macOS: installs Node/pnpm/
# Bun/ffmpeg-full via Homebrew (Bun via its own official installer, see
# below) if missing, installs JS deps for the whole workspace, generates
# the server's Prisma client, and creates server/.env (with FFMPEG_PATH
# pre-filled and an interactive OPENAI_API_KEY prompt) if one doesn't
# already exist.
#
# Safe to re-run -- every step checks before it acts, and an existing
# server/.env is never overwritten.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"

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

step "Checking for Bun"
if command -v bun &>/dev/null; then
  echo "Found Bun $(bun -v)."
else
  # Bun's own installer, not Homebrew: the Homebrew formula requires
  # compiling a native dependency (better-sqlite3, transitively) against
  # Xcode Command Line Tools, and fails on a CLT version that's gone
  # stale relative to the current macOS/Xcode release -- a common state
  # on a machine that hasn't run a manual CLT update in a while. Bun's
  # installer just downloads a prebuilt binary, sidestepping that
  # entirely (see https://bun.sh).
  echo "Installing Bun via its official installer..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "Installed Bun $(bun -v). Open a new terminal (or re-source your shell rc) to get 'bun' on PATH permanently."
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

step "Installing JS dependencies (client + server workspace)"
(cd "$REPO_ROOT" && pnpm install)

step "Generating the Prisma client"
(cd "$SERVER_DIR" && bunx prisma generate)

step "Setting up server/.env"
env_file="$SERVER_DIR/.env"
if [ -f "$env_file" ]; then
  echo "server/.env already exists -- leaving it as-is."
else
  cp "$SERVER_DIR/.env.example" "$env_file"
  echo "Created server/.env from .env.example."

  if [ -n "$ffmpeg_path_override" ]; then
    set_env_var "$env_file" \
      '# FFMPEG_PATH="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"' \
      "FFMPEG_PATH=\"$ffmpeg_path_override\""
    echo "Set FFMPEG_PATH to the Homebrew ffmpeg-full binary (fixes caption burn-in)."
  fi

  openai_key_input=""
  read -rsp "Paste your OpenAI API key (used server-side only; Enter to skip and edit server/.env by hand later): " openai_key_input || true
  echo
  if [ -n "$openai_key_input" ]; then
    set_env_var "$env_file" "OPENAI_API_KEY=sk-..." "OPENAI_API_KEY=$openai_key_input"
    echo "Set OPENAI_API_KEY in server/.env."
  else
    echo "Skipped -- transcription and AI features won't work until you set OPENAI_API_KEY in server/.env."
  fi
fi

step "Done"
cat <<EOF
Next:

  pnpm run dev

This starts both the Vite client and the Bun backend together. Then open
http://localhost:5173
EOF
