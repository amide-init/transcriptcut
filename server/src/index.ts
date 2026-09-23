import { Hono } from "hono";
import { cors } from "hono/cors";
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

const port = Number(process.env.PORT ?? 3001);
console.log(`server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  // Video uploads can be hundreds of MB -- raise Bun's default request body
  // size ceiling to match the upload route's own 500MB cap (see
  // src/routes/upload.ts) instead of relying on Bun's built-in default.
  maxRequestBodySize: 500 * 1024 * 1024,
};
