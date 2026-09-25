import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { logger } from "@/lib/logger";
import { runShotJob } from "@/lib/ffmpeg/shots";
import { generateScenePicks } from "@/lib/ai/scenes";
import { buildEditedSentences } from "@/lib/publishing/edited-transcript";
import { minSceneSeconds, scenesFromPicks } from "@/lib/scenes/suggest";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

export const scenesRoute = new Hono();

type ShotJob = Awaited<ReturnType<typeof prisma.transcriptionJob.findFirstOrThrow>>;

function shotJobJson(job: ShotJob) {
  return {
    id: job.id,
    status: job.status,
    shots: job.resultJson ? (JSON.parse(job.resultJson) as number[]) : null,
    error: job.error,
  };
}

async function latestShots(projectId: string): Promise<number[]> {
  const job = await prisma.transcriptionJob.findFirst({
    where: { projectId, kind: "shots", status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  return job?.resultJson ? (JSON.parse(job.resultJson) as number[]) : [];
}

/**
 * POST /api/projects/:id/scenes/shots -- detects shot changes in the
 * background (lib/ffmpeg/shots.ts). If one is already running, returns it
 * instead of starting another. Poll GET /scenes/shots/:jobId.
 */
scenesRoute.post("/:id/scenes/shots", async (c) => {
  const id = c.req.param("id");
  const video = await prisma.asset.findFirst({ where: { projectId: id, kind: { in: ["original", "proxy"] } } });
  if (!video) return errorResponse(c, "NO_VIDEO", "Upload a video first.", 400);

  const running = await prisma.transcriptionJob.findFirst({
    where: { projectId: id, kind: "shots", status: { in: ["queued", "processing"] } },
  });
  if (running) return c.json({ success: true, jobId: running.id });

  const job = await prisma.transcriptionJob.create({ data: { projectId: id, kind: "shots", status: "queued" } });
  void runShotJob(job.id);
  return c.json({ success: true, jobId: job.id }, 202);
});

/** The most recent shot detection for this project, if any -- so the panel can show it after a reload. */
scenesRoute.get("/:id/scenes/shots", async (c) => {
  const job = await prisma.transcriptionJob.findFirst({
    where: { projectId: c.req.param("id"), kind: "shots" },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ success: true, job: job ? shotJobJson(job) : null });
});

scenesRoute.get("/:id/scenes/shots/:jobId", async (c) => {
  const job = await prisma.transcriptionJob.findUnique({ where: { id: c.req.param("jobId") } });
  if (!job || job.projectId !== c.req.param("id") || job.kind !== "shots") {
    return errorResponse(c, "NOT_FOUND", "Shot detection job not found.", 404);
  }
  return c.json({ success: true, job: shotJobJson(job) });
});

/**
 * POST /api/projects/:id/scenes/suggest -- AI scene suggestions for review.
 * Returns suggestions only; the client applies the ones the user keeps as
 * ordinary split/card operations. Uses the latest shot detection, if any,
 * to land boundaries on visual cuts.
 */
scenesRoute.post("/:id/scenes/suggest", async (c) => {
  const id = c.req.param("id");
  const project = await prisma.project.findUnique({
    where: { id },
    include: { transcript: true, editOperations: true },
  });
  if (!project) return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  if (!project.transcript) return errorResponse(c, "NO_TRANSCRIPT", "Transcribe this project first.", 400);
  if (project.duration === null) return errorResponse(c, "NO_DURATION", "Open the project once first.", 400);

  const transcript: Transcript = { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) };
  const cuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");
  const sentences = buildEditedSentences(transcript, cuts, project.duration);
  if (sentences.length === 0) {
    return errorResponse(c, "NOTHING_TO_SPLIT", "There's no remaining speech to split into scenes.", 400);
  }

  const shots = await latestShots(id);
  const minGap = minSceneSeconds(sentences[sentences.length - 1].end);
  try {
    const picks = await generateScenePicks(sentences, minGap);
    const words = transcript.segments.flatMap((s) => s.words);
    return c.json({ success: true, suggestions: scenesFromPicks(picks, sentences, words, shots, minGap), usedShots: shots.length > 0 });
  } catch (err) {
    logger.error("Scene suggestion failed:", err);
    return errorResponse(c, "AI_FAILED", "Scenes couldn't be suggested. Please try again.", 502);
  }
});
