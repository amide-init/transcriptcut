import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { runTranscriptionJob } from "@/lib/ai/transcription-job";
import { errorResponse } from "@/lib/http";

export const transcribeRoute = new Hono();

/**
 * Starts a background transcription job and returns its id immediately (202);
 * the client polls GET /:id/transcribe/:jobId for progress. The job extracts
 * a small audio track and transcribes it in chunks (lib/ai/transcription-job.ts),
 * so source size no longer runs into Whisper's 25MB upload cap.
 */
transcribeRoute.post("/:id/transcribe", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "original" } });
  if (!asset) {
    return errorResponse(c, "NO_VIDEO", "Upload a video before transcribing.", 400);
  }

  const running = await prisma.transcriptionJob.findFirst({
    where: { projectId: id, status: { in: ["queued", "processing"] } },
  });
  if (running) {
    return errorResponse(c, "ALREADY_TRANSCRIBING", "This project is already being transcribed.", 409);
  }

  const job = await prisma.transcriptionJob.create({ data: { projectId: id, status: "queued" } });

  // Fire-and-forget, same as the render route: runTranscriptionJob catches
  // every error itself and records it on the job row.
  void runTranscriptionJob(job.id);

  return c.json({ success: true, jobId: job.id }, 202);
});

transcribeRoute.get("/:id/transcribe/:jobId", async (c) => {
  const id = c.req.param("id");
  const jobId = c.req.param("jobId");

  const job = await prisma.transcriptionJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id) {
    return errorResponse(c, "NOT_FOUND", "Transcription job not found.", 404);
  }

  return c.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      totalChunks: job.totalChunks,
      completedChunks: job.completedChunks,
      error: job.error,
    },
  });
});
