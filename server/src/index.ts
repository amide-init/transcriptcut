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

const port = Number(process.env.PORT ?? 3001);
logger.info(`server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  // Video uploads can be hundreds of MB -- raise Bun's default request body
  // size ceiling to match the upload route's own 500MB cap (see
  // src/routes/upload.ts) instead of relying on Bun's built-in default.
  maxRequestBodySize: 500 * 1024 * 1024,
};
