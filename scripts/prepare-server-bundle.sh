#!/usr/bin/env bash
#
# Assembles a self-contained copy of the backend at repo-root
# server-bundle/, suitable for running with `bun run src/index.ts` from any
# working directory -- not just this git checkout. Used by the Tauri
# packaging build (client/src-tauri/tauri.conf.json's beforeBuildCommand),
# and independently verifiable via the Phase 0 risk-gate check described in
# the packaging plan.
#
# Not run automatically by `pnpm run dev` or CI -- only by the Tauri build.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
CLIENT_DIR="$REPO_ROOT/client"
OUT_DIR="$REPO_ROOT/server-bundle"

step() { printf '\n==> %s\n' "$1"; }

step "Cleaning previous server-bundle"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# node_modules here has to satisfy two things at once, and getting there
# took three attempts:
#
# 1. It must be genuinely self-contained (no symlinks pointing back into
#    this git checkout's central pnpm store) -- a plain `rsync -aL
#    server/node_modules` fails this: pnpm resolves a package's transitive
#    deps through a *private* per-package node_modules slot living inside
#    the workspace root's .pnpm store as a *sibling* of the requiring
#    package (e.g. @prisma/adapter-libsql's own @libsql/client dependency
#    lives at node_modules/.pnpm/@prisma+adapter-libsql@.../node_modules/,
#    not anywhere reachable by walking server/node_modules's own tree), so
#    a naive copy silently drops @libsql/client.
#
# 2. It must contain zero symlinks at all -- Tauri's `bundle.resources`
#    copy step does not handle pnpm's nested private-slot symlink
#    structure correctly (confirmed: a packaged app failed with "Cannot
#    find module '@prisma/adapter-libsql'"; comparing file counts showed
#    Tauri's copy landed the same file count but zero of the source's 395
#    symlinks, silently dropping directories only reachable via one).
#    `pnpm deploy` alone satisfies (1) but not (2) -- its own node_modules
#    is self-contained but still internally symlinked. Naively
#    dereferencing those symlinks after the fact (rsync -aL) breaks (1)
#    again: each symlink gets flattened independently, losing the sibling
#    relationship @prisma/adapter-libsql depends on to find @libsql/client
#    once it's no longer nested inside its own private slot.
#
# pnpm's "hoisted" node-linker satisfies both at once -- it's a
# classic/npm-style flat layout (every package, including transitive
# deps, sits directly at node_modules/<pkg>) with no private per-package
# slots and no .pnpm store to symlink into. Verified empirically before
# relying on it: a hoisted install of just server's prod dependencies
# landed @libsql/client and @libsql/darwin-arm64 directly under
# node_modules/@libsql/, and @prisma/adapter-libsql resolves them via a
# normal upward directory walk, same as npm would produce.
step "Installing production dependencies with pnpm's hoisted node-linker"
cp "$SERVER_DIR"/package.json "$OUT_DIR"/package.json
(cd "$OUT_DIR" && pnpm install --config.node-linker=hoisted --prod --ignore-workspace)

step "Copying server source, Prisma schema, and config"
cp -R "$SERVER_DIR"/src "$OUT_DIR"/src
cp -R "$SERVER_DIR"/prisma "$OUT_DIR"/prisma
cp "$SERVER_DIR"/tsconfig.json "$OUT_DIR"/tsconfig.json
cp "$SERVER_DIR"/prisma7.config.ts "$OUT_DIR"/prisma7.config.ts

step "Generating the Prisma client (from server/, which has the prisma CLI)"
(cd "$SERVER_DIR" && bunx prisma generate)
rm -rf "$OUT_DIR"/src/generated
mkdir -p "$OUT_DIR"/src/generated
cp -R "$SERVER_DIR"/src/generated/prisma "$OUT_DIR"/src/generated/

step "Copying built client (client/dist) as static assets"
if [ ! -d "$CLIENT_DIR/dist" ]; then
  echo "client/dist is missing -- run 'pnpm --filter client build' first." >&2
  exit 1
fi
cp -R "$CLIENT_DIR"/dist "$OUT_DIR"/client-dist

# Deliberately not copying server/.env into the bundle: OPENAI_API_KEY
# now comes from settings.json (written by the app's own first-run setup
# screen, see server/src/lib/settings.ts), not a build-time file -- a
# real distributable build must never ship with the developer's own key
# baked in. Every other env var the server needs (DATABASE_URL, DATA_DIR,
# PORT, CORS_ORIGIN, FFMPEG_PATH) is already set explicitly by
# client/src-tauri/src/lib.rs's spawn call, which overrides whatever a
# bundled .env would have provided anyway -- so there's nothing left for
# a bundled .env to actually do.

step "Bootstrapping a pre-migrated empty app.db template"
TMP_DIR="$(mktemp -d)"
TMP_DB="$TMP_DIR/app.db"
(cd "$SERVER_DIR" && DATABASE_URL="file:$TMP_DB" bunx prisma migrate deploy)
cp "$TMP_DB" "$OUT_DIR"/app.db.template
rm -rf "$TMP_DIR"

step "Done: $OUT_DIR (run with: cd $OUT_DIR && bun run src/index.ts)"
