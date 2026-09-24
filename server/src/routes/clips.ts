import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { buildEditedSentences } from "@/lib/publishing/edited-transcript";
import { highlightsFromPicks } from "@/lib/clips/clips";
import { findHighlightPicks } from "@/lib/ai/highlights";
import { createClipSchema, updateClipSchema } from "@/lib/validation/clips";
import type { Clip, ClipAspect } from "@/types/clips";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

export const clipsRoute = new Hono();

type ClipRow = Awaited<ReturnType<typeof prisma.clip.findFirstOrThrow>>;

function toClip(row: ClipRow): Clip {
  return {
    id: row.id,
    name: row.name,
    sourceStart: row.sourceStart,
    sourceEnd: row.sourceEnd,
    aspect: row.aspect as ClipAspect,
    cropX: row.cropX,
    captions: row.captions,
    source: row.source === "ai" ? "ai" : "manual",
    reason: row.reason,
  };
}

async function listClips(projectId: string): Promise<Clip[]> {
  const rows = await prisma.clip.findMany({ where: { projectId }, orderBy: { sourceStart: "asc" } });
  return rows.map(toClip);
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

clipsRoute.get("/:id/clips", async (c) => {
  return c.json({ success: true, clips: await listClips(c.req.param("id")) });
});

/**
 * POST /api/projects/:id/clips/highlights -- asks the model for the episode's
 * most clip-worthy moments. Replaces earlier AI suggestions; clips the user
 * made by hand are kept.
 */
clipsRoute.post("/:id/clips/highlights", async (c) => {
  const id = c.req.param("id");
  const project = await prisma.project.findUnique({ where: { id }, include: { transcript: true, editOperations: true } });
  if (!project) return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  if (!project.transcript) return errorResponse(c, "NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  if (project.duration === null) {
    return errorResponse(c, "NO_DURATION", "This project's video duration isn't known yet.", 400);
  }

  const transcript: Transcript = { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) };
  const cuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");
  const sentences = buildEditedSentences(transcript, cuts, project.duration);
  if (sentences.length === 0) {
    return errorResponse(c, "NOTHING_TO_CLIP", "There's no remaining speech to find highlights in.", 400);
  }

  try {
    const picks = await findHighlightPicks(sentences);
    const clips = highlightsFromPicks(picks, sentences, project.duration);
    await prisma.$transaction([
      prisma.clip.deleteMany({ where: { projectId: id, source: "ai" } }),
      ...clips.map((clip) => prisma.clip.create({ data: { projectId: id, ...clip } })),
    ]);
    return c.json({ success: true, clips: await listClips(id), found: clips.length });
  } catch (err) {
    logger.error("Highlight detection failed:", err);
    return errorResponse(c, "AI_FAILED", "Highlights couldn't be found. Please try again.", 502);
  }
});

clipsRoute.post("/:id/clips", async (c) => {
  const id = c.req.param("id");
  const parsed = createClipSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return errorResponse(c, "INVALID_CLIP", parsed.error.issues[0]?.message ?? "Invalid clip.", 400);
  }
  const project = await prisma.project.findUnique({ where: { id }, select: { duration: true } });
  if (!project) return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  if (project.duration !== null && parsed.data.sourceEnd > project.duration + 0.5) {
    return errorResponse(c, "INVALID_CLIP", "The clip runs past the end of the video.", 400);
  }

  const count = await prisma.clip.count({ where: { projectId: id } });
  await prisma.clip.create({
    data: {
      projectId: id,
      name: parsed.data.name ?? `Clip ${count + 1}`,
      sourceStart: parsed.data.sourceStart,
      sourceEnd: parsed.data.sourceEnd,
      source: "manual",
    },
  });
  return c.json({ success: true, clips: await listClips(id) }, 201);
});

clipsRoute.patch("/:id/clips/:clipId", async (c) => {
  const id = c.req.param("id");
  const parsed = updateClipSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid update.", 400);
  }
  const clip = await prisma.clip.findUnique({ where: { id: c.req.param("clipId") } });
  if (!clip || clip.projectId !== id) return errorResponse(c, "NOT_FOUND", "Clip not found.", 404);

  await prisma.clip.update({ where: { id: clip.id }, data: parsed.data });
  return c.json({ success: true, clips: await listClips(id) });
});

clipsRoute.delete("/:id/clips/:clipId", async (c) => {
  const id = c.req.param("id");
  const clip = await prisma.clip.findUnique({ where: { id: c.req.param("clipId") } });
  if (!clip || clip.projectId !== id) return errorResponse(c, "NOT_FOUND", "Clip not found.", 404);

  await prisma.clip.delete({ where: { id: clip.id } });
  return c.json({ success: true, clips: await listClips(id) });
});
