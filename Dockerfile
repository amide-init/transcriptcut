# Runs the app as one container: the Bun server serves both the built
# client and /api/* on port 3001, with all project data under /data.
# See compose.yaml for how to run it, and claude.md section 35.

# --- build: install the workspace, generate Prisma, build the client ----
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /src

# Manifests first, so the dependency layer is cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/
COPY server/package.json server/
RUN pnpm install --frozen-lockfile

COPY client client
COPY server server
RUN pnpm --filter server db:generate \
 && pnpm --filter client build \
 && pnpm --filter server deploy --prod --legacy /out/server

# --- runtime ------------------------------------------------------------
FROM oven/bun:1.4.2-debian

# Fonts for burned-in captions and title cards: Liberation stands in for
# Arial/Helvetica/Courier New (metric-compatible, aliased by fontconfig),
# DejaVu is the fallback for the rest of CAPTION_FONTS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fontconfig fonts-liberation2 fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# Static ffmpeg/ffprobe with libass, pinned to the version the xfade
# workarounds in lib/ffmpeg/plan.ts were measured on.
COPY --from=mwader/static-ffmpeg:9.0.2 /ffmpeg /ffprobe /usr/local/bin/

WORKDIR /app
COPY --from=build /out/server ./
# Gitignored, so `pnpm deploy` leaves it out.
COPY --from=build /src/server/src/generated ./src/generated
COPY --from=build /src/client/dist ./client-dist

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/app.db \
    CLIENT_DIST_DIR=/app/client-dist

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3001

CMD ["bun", "src/index.ts"]
