import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { TRANSCRIPT_JOB_KINDS } from "@/lib/jobs";
import { runDiarizationJob } from "@/lib/ai/diarization-job";
import type { Transcript } from "@/types/transcript";

export const speakersRoute = new Hono();

/**
 * POST /api/projects/:id/speakers/detect -- starts background speaker
 * detection (lib/ai/diarization-job.ts). Replaces any existing speaker labels
 * when it finishes. Poll GET /speakers/detect/:jobId for progress.
 */
speakersRoute.post("/:id/speakers/detect", async (c) => {
  const id = c.req.param("id");

  const transcript = await prisma.transcript.findUnique({ where: { projectId: id }, select: { id: true } });
  if (!transcript) {
    return errorResponse(c, "NO_TRANSCRIPT", "Transcribe this project before detecting speakers.", 400);
  }
  // Transcription and speaker detection both rewrite the transcript -- never run them concurrently.
  const running = await prisma.transcriptionJob.findFirst({
    // Only jobs that rewrite the transcript conflict; shot detection only reads the video.
    where: { projectId: id, kind: { in: TRANSCRIPT_JOB_KINDS }, status: { in: ["queued", "processing"] } },
  });
  if (running) {
    return errorResponse(c, "ALREADY_RUNNING", "This project's transcript is already being processed.", 409);
  }

  const job = await prisma.transcriptionJob.create({ data: { projectId: id, kind: "diarize", status: "queued" } });
  void runDiarizationJob(job.id);
  return c.json({ success: true, jobId: job.id }, 202);
});

speakersRoute.get("/:id/speakers/detect/:jobId", async (c) => {
  const id = c.req.param("id");
  const job = await prisma.transcriptionJob.findUnique({ where: { id: c.req.param("jobId") } });
  if (!job || job.projectId !== id || job.kind !== "diarize") {
    return errorResponse(c, "NOT_FOUND", "Speaker detection job not found.", 404);
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

const renameSchema = z.object({
  from: z.string().trim().min(1).max(100),
  /** null clears the label from every segment that had `from`. */
  to: z.string().trim().min(1).max(100).nullable(),
});

/** POST /api/projects/:id/speakers/rename -- renames (or clears) a speaker on every segment at once. */
speakersRoute.post("/:id/speakers/rename", async (c) => {
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse(c, "NOT_FOUND", "This project has no transcript yet.", 404);
  }

  const { from, to } = parsed.data;
  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };
  for (const segment of transcript.segments) {
    if (segment.speaker !== from) continue;
    if (to === null) delete segment.speaker;
    else segment.speaker = to;
  }
  await prisma.transcript.update({
    where: { projectId: id },
    data: { segmentsJson: JSON.stringify(transcript.segments) },
  });
  return c.json({ success: true, transcript });
});
