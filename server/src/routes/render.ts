import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { runRenderJob } from "@/lib/ffmpeg/render-job";
import { captionStyleSchema } from "@/lib/validation/caption-style";
import { resolveInDataDir } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";
import type { CaptionStyle } from "@/lib/captions/style";

export const renderRoute = new Hono();

renderRoute.post("/:id/render", async (c) => {
  const id = c.req.param("id");

  let burnInCaptions = false;
  let captionStyle: CaptionStyle | undefined;
  try {
    const body = await c.req.json();
    burnInCaptions = body?.burnInCaptions === true;
    if (burnInCaptions && body?.captionStyle !== undefined) {
      const parsed = captionStyleSchema.safeParse(body.captionStyle);
      if (!parsed.success) {
        return errorResponse(c, "INVALID_CAPTION_STYLE", "Invalid caption style.", 400);
      }
      captionStyle = parsed.data;
    }
  } catch {
    // No body (or invalid JSON) just means "no captions" -- not an error.
  }

  const project = await prisma.project.findUnique({ where: { id }, include: { assets: true } });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }
  if (!project.assets.some((a) => a.kind === "original")) {
    return errorResponse(c, "NO_VIDEO", "This project has no video to render.", 400);
  }

  const job = await prisma.renderJob.create({ data: { projectId: id, status: "queued" } });

  // Fire-and-forget: never block the request on FFmpeg (spec section 14).
  // No `waitUntil` needed here -- Bun.serve() is one long-lived process, not
  // a request-scoped function, so this promise keeps running on the event
  // loop after the response flushes. runRenderJob's own try/catch already
  // swallows every error and writes status "failed", so an unhandled
  // rejection here can't take the process down.
  void runRenderJob(job.id, { burnInCaptions, captionStyle });

  return c.json({ success: true, jobId: job.id }, 202);
});

renderRoute.get("/:id/render/:jobId", async (c) => {
  const id = c.req.param("id");
  const jobId = c.req.param("jobId");

  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id) {
    return errorResponse(c, "NOT_FOUND", "Render job not found.", 404);
  }

  return c.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      error: job.error,
      downloadUrl: job.status === "completed" ? `/api/projects/${id}/render/${jobId}/download` : null,
    },
  });
});

renderRoute.get("/:id/render/:jobId/download", async (c) => {
  const id = c.req.param("id");
  const jobId = c.req.param("jobId");

  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id || job.status !== "completed" || !job.outputPath) {
    return errorResponse(c, "NOT_READY", "This render isn't ready to download.", 404);
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  const filename = `${(project?.name ?? "video").replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;

  const file = Bun.file(resolveInDataDir(job.outputPath));
  return new Response(file, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
