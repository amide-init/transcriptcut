import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { EXPORT_MIME_TYPES, runRenderJob } from "@/lib/ffmpeg/render-job";
import { exportFormatSchema } from "@/lib/validation/publishing";
import type { ExportFormat } from "@/types/publishing";
import { captionStyleSchema } from "@/lib/validation/caption-style";
import { resolveInDataDir } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";
import type { CaptionStyle } from "@/lib/captions/style";
import { z } from "zod";
import { audioSettingsSchema } from "@/lib/validation/audio-settings";
import { deleteAudioPreviewFiles, runAudioPreviewJob } from "@/lib/ffmpeg/audio-preview";

export const renderRoute = new Hono();

renderRoute.post("/:id/render", async (c) => {
  const id = c.req.param("id");

  let burnInCaptions = false;
  let captionStyle: CaptionStyle | undefined;
  let format: ExportFormat = "mp4";
  try {
    const body = await c.req.json();
    if (body?.format !== undefined) {
      const parsedFormat = exportFormatSchema.safeParse(body.format);
      if (!parsedFormat.success) {
        return errorResponse(c, "INVALID_FORMAT", "Export format must be mp4, mp3 or wav.", 400);
      }
      format = parsedFormat.data;
    }
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

  const job = await prisma.renderJob.create({ data: { projectId: id, status: "queued", format } });

  // Fire-and-forget: never block the request on FFmpeg (spec section 14).
  // No `waitUntil` needed here -- Bun.serve() is one long-lived process, not
  // a request-scoped function, so this promise keeps running on the event
  // loop after the response flushes. runRenderJob's own try/catch already
  // swallows every error and writes status "failed", so an unhandled
  // rejection here can't take the process down.
  void runRenderJob(job.id, { burnInCaptions, captionStyle });

  return c.json({ success: true, jobId: job.id }, 202);
});

const audioPreviewRequestSchema = z.object({
  /** Source-time position to start the sample from (usually the playhead). */
  start: z.number().finite().min(0),
  /**
   * The Audio panel's current settings, sent explicitly rather than read
   * from the project row, so the preview always matches what's on screen
   * even if the settings PATCH is still in flight.
   */
  audioSettings: audioSettingsSchema,
});

/**
 * POST /api/projects/:id/render/audio-preview -- starts a short before/after
 * audio sample job (see lib/ffmpeg/audio-preview.ts). Only the latest
 * preview per project is kept: earlier previews' rows and files are removed.
 */
renderRoute.post("/:id/render/audio-preview", async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }
  const parsed = audioPreviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const project = await prisma.project.findUnique({ where: { id }, include: { assets: true } });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }
  if (!project.assets.some((a) => a.kind === "original")) {
    return errorResponse(c, "NO_VIDEO", "This project has no video to preview.", 400);
  }

  const previous = await prisma.renderJob.findMany({ where: { projectId: id, kind: "audio-preview" } });
  await Promise.all(previous.map((job) => deleteAudioPreviewFiles(id, job.id)));
  await prisma.renderJob.deleteMany({ where: { projectId: id, kind: "audio-preview" } });

  const job = await prisma.renderJob.create({ data: { projectId: id, kind: "audio-preview", status: "queued" } });
  void runAudioPreviewJob(job.id, parsed.data.start, parsed.data.audioSettings);

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
      previewUrls:
        job.kind === "audio-preview" && job.status === "completed"
          ? {
              before: `/api/projects/${id}/render/${jobId}/download?variant=before`,
              after: `/api/projects/${id}/render/${jobId}/download`,
            }
          : null,
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

  // Previews play inline in an <audio> element (Bun.file handles its Range requests).
  if (job.kind === "audio-preview") {
    const outputPath =
      c.req.query("variant") === "before" ? job.outputPath.replace(/\.m4a$/, "-before.m4a") : job.outputPath;
    return new Response(Bun.file(resolveInDataDir(outputPath)), {
      headers: { "Content-Type": "audio/mp4", "Accept-Ranges": "bytes" },
    });
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  const parsedFormat = exportFormatSchema.safeParse(job.format);
  const format: ExportFormat = parsedFormat.success ? parsedFormat.data : "mp4";
  const filename = `${(project?.name ?? "video").replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`;

  const file = Bun.file(resolveInDataDir(job.outputPath));
  return new Response(file, {
    headers: {
      "Content-Type": EXPORT_MIME_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
