import { existsSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { logger } from "@/lib/logger";
import { projectsRoute } from "@/routes/projects";
import { uploadRoute } from "@/routes/upload";
import { videoRoute } from "@/routes/video";
import { transcribeRoute } from "@/routes/transcribe";
import { transcriptRoute } from "@/routes/transcript";
import { operationsRoute } from "@/routes/operations";
import { fillerWordsRoute } from "@/routes/filler-words";
import { captionsRoute } from "@/routes/captions";
import { logoRoute } from "@/routes/logo";
import { renderRoute } from "@/routes/render";
import { settingsRoute } from "@/routes/settings";
import { publishingRoute } from "@/routes/publishing";
import { speakersRoute } from "@/routes/speakers";
import { mediaRoute } from "@/routes/media";
import { clipsRoute } from "@/routes/clips";
import { prisma } from "@/lib/db/client";
import { getMaxUploadBytes } from "@/lib/limits";
import { applyPendingMigrations } from "@/lib/db/migrate";

const app = new Hono();

app.use(honoLogger(logger.raw));
app.use("/api/*", cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));

app.route("/api/projects", projectsRoute);
app.route("/api/projects", uploadRoute);
app.route("/api/projects", videoRoute);
app.route("/api/projects", transcribeRoute);
app.route("/api/projects", transcriptRoute);
app.route("/api/projects", operationsRoute);
app.route("/api/projects", fillerWordsRoute);
app.route("/api/projects", captionsRoute);
app.route("/api/projects", logoRoute);
app.route("/api/projects", renderRoute);
app.route("/api/projects", publishingRoute);
app.route("/api/projects", speakersRoute);
app.route("/api/projects", clipsRoute);
app.route("/api/projects", mediaRoute);
app.route("/api/settings", settingsRoute);

// Serves the built Vite client (server-bundle/client-dist in the packaged
// Tauri app; unset/missing in plain `bun run dev`, where Vite's own dev
// server handles the client instead) so one process can serve both the
// UI and the API -- registered after every /api/* mount so static/SPA
// fallback routes never shadow an API request.
const clientDistDir = process.env.CLIENT_DIST_DIR ?? "./client-dist";
if (existsSync(clientDistDir)) {
  app.use("/*", serveStatic({ root: clientDistDir }));
  // SPA fallback: a client-side route like /editor/abc123 has no matching
  // file on disk, so serve index.html and let React Router take over.
  // `root` must be passed alongside `path` here -- Hono's serveStatic
  // joins them with `path.join(root, path)`, and path.join("./", "/abs/…")
  // silently strips the leading slash off an absolute `path`, breaking the
  // lookup (confirmed empirically) if `root` is left at its "./" default.
  app.get("*", serveStatic({ root: clientDistDir, path: "index.html" }));
}

// Bring an existing database (e.g. a packaged-app install from an older
// version) up to the current schema before anything queries it.
await applyPendingMigrations();

// Jobs run in-process, so any still "queued"/"processing" at startup were
// interrupted by a restart and will never finish -- mark them failed so the
// client stops polling and a retry isn't blocked as "already running".
await prisma.transcriptionJob.updateMany({
  where: { status: { in: ["queued", "processing"] } },
  data: { status: "failed", error: "Interrupted by a server restart. Please try again." },
});

const port = Number(process.env.PORT ?? 3001);
logger.info(`server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  // Video uploads can be many GB -- raise Bun's default request body size
  // ceiling to match the upload route's own cap (see src/lib/limits.ts)
  // instead of relying on Bun's built-in default.
  maxRequestBodySize: getMaxUploadBytes(),
};
