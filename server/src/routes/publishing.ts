import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { errorResponse } from "@/lib/http";
import { computePlayableRanges, getEditedDuration } from "@/lib/timeline/cuts";
import { buildEditedSentences, formatTranscript } from "@/lib/publishing/edited-transcript";
import {
  chaptersFromPicks,
  cleanChapterTitle,
  minChapterSeconds,
  resolveChapters,
  toYoutubeChapters,
} from "@/lib/publishing/chapters";
import { generateChapterPicks, generateShowNotes } from "@/lib/ai/publishing";
import { updateChaptersSchema, updateShowNotesSchema } from "@/lib/validation/publishing";
import type { Chapter, ShowNotes } from "@/types/publishing";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

export const publishingRoute = new Hono();

/** Everything the publishing endpoints need, derived from the project's current edit state. */
async function loadEditedProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { transcript: true, editOperations: true, publishingMeta: true },
  });
  const fail = (code: string, message: string, status: 400 | 404) => ({ ok: false as const, error: { code, message, status } });
  if (!project) return fail("NOT_FOUND", "Project not found.", 404);
  if (!project.transcript) return fail("NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  if (project.duration === null) return fail("NO_DURATION", "This project's video duration isn't known yet.", 400);

  const transcript: Transcript = { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) };
  const cuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");
  const ranges = computePlayableRanges(project.duration, cuts);
  return {
    ok: true as const,
    project,
    ranges,
    editedDuration: getEditedDuration(ranges),
    sentences: buildEditedSentences(transcript, cuts, project.duration),
    chapters: project.publishingMeta?.chaptersJson ? (JSON.parse(project.publishingMeta.chaptersJson) as Chapter[]) : [],
    showNotes: project.publishingMeta?.showNotesJson
      ? (JSON.parse(project.publishingMeta.showNotesJson) as ShowNotes)
      : null,
  };
}

type Loaded = Extract<Awaited<ReturnType<typeof loadEditedProject>>, { ok: true }>;

function publishingResponse(c: Context, loaded: Loaded, chapters: Chapter[], showNotes: ShowNotes | null) {
  const resolved = resolveChapters(chapters, loaded.ranges);
  return c.json({
    success: true,
    chapters: resolved,
    youtubeChapters: toYoutubeChapters(resolved, loaded.editedDuration),
    showNotes,
  });
}

async function saveMeta(projectId: string, data: { chaptersJson?: string; showNotesJson?: string }) {
  await prisma.publishingMeta.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

publishingRoute.get("/:id/publishing", async (c) => {
  const loaded = await loadEditedProject(c.req.param("id"));
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);
  return publishingResponse(c, loaded, loaded.chapters, loaded.showNotes);
});

publishingRoute.post("/:id/publishing/chapters", async (c) => {
  const id = c.req.param("id");
  const loaded = await loadEditedProject(id);
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);
  if (loaded.sentences.length === 0) {
    return errorResponse(c, "NOTHING_TO_CHAPTER", "There's no remaining speech to split into chapters.", 400);
  }

  try {
    const minGap = minChapterSeconds(loaded.editedDuration);
    const picks = await generateChapterPicks(loaded.sentences, minGap);
    const chapters = chaptersFromPicks(picks, loaded.sentences, minGap);
    await saveMeta(id, { chaptersJson: JSON.stringify(chapters) });
    return publishingResponse(c, loaded, chapters, loaded.showNotes);
  } catch (err) {
    logger.error("Chapter generation failed:", err);
    return errorResponse(c, "AI_FAILED", "Chapters couldn't be generated. Please try again.", 502);
  }
});

publishingRoute.put("/:id/publishing/chapters", async (c) => {
  const id = c.req.param("id");
  const parsed = updateChaptersSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid chapters.", 400);
  }
  const loaded = await loadEditedProject(id);
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);

  const chapters: Chapter[] = parsed.data.chapters
    .map((ch) => ({ title: cleanChapterTitle(ch.title), sourceStart: ch.sourceStart }))
    .filter((ch) => ch.title.length > 0)
    .sort((a, b) => a.sourceStart - b.sourceStart)
    .map((ch, i) => ({ id: `chapter-${i}`, ...ch }));
  await saveMeta(id, { chaptersJson: JSON.stringify(chapters) });
  return publishingResponse(c, loaded, chapters, loaded.showNotes);
});

publishingRoute.post("/:id/publishing/show-notes", async (c) => {
  const id = c.req.param("id");
  const loaded = await loadEditedProject(id);
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);
  if (loaded.sentences.length === 0) {
    return errorResponse(c, "NOTHING_TO_SUMMARIZE", "There's no remaining speech to write show notes from.", 400);
  }

  try {
    const showNotes = await generateShowNotes(loaded.sentences);
    await saveMeta(id, { showNotesJson: JSON.stringify(showNotes) });
    return publishingResponse(c, loaded, loaded.chapters, showNotes);
  } catch (err) {
    logger.error("Show notes generation failed:", err);
    return errorResponse(c, "AI_FAILED", "Show notes couldn't be generated. Please try again.", 502);
  }
});

publishingRoute.put("/:id/publishing/show-notes", async (c) => {
  const id = c.req.param("id");
  const parsed = updateShowNotesSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid show notes.", 400);
  }
  const loaded = await loadEditedProject(id);
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);

  const showNotes: ShowNotes = {
    summary: parsed.data.summary.trim(),
    keyPoints: parsed.data.keyPoints.map((p) => p.trim()).filter(Boolean),
    titles: parsed.data.titles.map((t) => t.trim()).filter(Boolean),
  };
  await saveMeta(id, { showNotesJson: JSON.stringify(showNotes) });
  return publishingResponse(c, loaded, loaded.chapters, showNotes);
});

/** GET /api/projects/:id/transcript/export?format=txt|md -- the edited episode's transcript, with speakers and timestamps. */
publishingRoute.get("/:id/transcript/export", async (c) => {
  const loaded = await loadEditedProject(c.req.param("id"));
  if (!loaded.ok) return errorResponse(c, loaded.error.code, loaded.error.message, loaded.error.status);
  const format = c.req.query("format") === "md" ? "md" : "txt";
  const body = formatTranscript(loaded.sentences, format, loaded.project.name);
  const filename = `${loaded.project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}-transcript.${format}`;
  return c.body(body, 200, {
    "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});
