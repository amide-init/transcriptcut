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

# `pnpm deploy` (not a plain rsync/cp of server/node_modules, and not a
# `bun build --target bun` single-file bundle) is required here, for two
# independently-confirmed reasons:
#
# 1. pnpm resolves a package's transitive deps through a "private"
#    per-package node_modules slot inside the workspace root's .pnpm store
#    (e.g. @prisma/adapter-libsql's own @libsql/client dependency lives as
#    a *sibling* of adapter-libsql inside
#    node_modules/.pnpm/@prisma+adapter-libsql@.../node_modules/, not
#    anywhere reachable by walking server/node_modules's own directory
#    tree). A naive `rsync -aL server/node_modules` dereferences symlinks
#    it finds but has no way to discover that sibling relationship, so
#    @libsql/client silently goes missing. `pnpm deploy` rebuilds a fully
#    self-contained node_modules (its own local .pnpm virtual store) that
#    correctly recreates the whole transitive graph.
#
# 2. `bun build --target bun` bundles everything into one flat index.js at
#    the top level, which *destroys* that same private-slot resolution
#    trick: @libsql/darwin-arm64 (a native binary, left as an external
#    runtime require rather than inlined) then gets looked up relative to
#    index.js's own location, which no longer has the nested
#    node_modules/.pnpm/libsql@.../node_modules/@libsql/ ancestry the
#    resolution depends on -- confirmed by a bundled run failing with
#    "Cannot find module '@libsql/darwin-arm64'" even though the exact
#    same files work when run unbundled. So this bundle ships the
#    TypeScript source as-is (Bun runs .ts directly, no build step) and
#    runs via `bun run src/index.ts`, keeping every file's location
#    relative to node_modules unchanged from how pnpm deploy laid it out.
step "Running pnpm deploy to produce a self-contained server + node_modules"
pnpm --filter server deploy --prod --legacy "$OUT_DIR"

step "Generating the Prisma client (from server/, which has the prisma CLI)"
(cd "$SERVER_DIR" && bunx prisma generate)
mkdir -p "$OUT_DIR"/src/generated
rm -rf "$OUT_DIR"/src/generated/prisma
cp -R "$SERVER_DIR"/src/generated/prisma "$OUT_DIR"/src/generated/

step "Copying built client (client/dist) as static assets"
if [ ! -d "$CLIENT_DIR/dist" ]; then
  echo "client/dist is missing -- run 'pnpm --filter client build' first." >&2
  exit 1
fi
cp -R "$CLIENT_DIR"/dist "$OUT_DIR"/client-dist

step "Bootstrapping a pre-migrated empty app.db template"
TMP_DIR="$(mktemp -d)"
TMP_DB="$TMP_DIR/app.db"
(cd "$SERVER_DIR" && DATABASE_URL="file:$TMP_DB" bunx prisma migrate deploy)
cp "$TMP_DB" "$OUT_DIR"/app.db.template
rm -rf "$TMP_DIR"

step "Copying server/.env (OPENAI_API_KEY etc. -- stays inside the built .app, personal use only)"
if [ ! -f "$SERVER_DIR/.env" ]; then
  echo "server/.env is missing -- copy server/.env.example to server/.env and fill it in first." >&2
  exit 1
fi
cp "$SERVER_DIR"/.env "$OUT_DIR"/.env

step "Done: $OUT_DIR (run with: cd $OUT_DIR && bun run src/index.ts)"
