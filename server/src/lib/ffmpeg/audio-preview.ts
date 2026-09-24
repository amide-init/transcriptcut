import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import { buildAudioOnlyRenderArgs } from "@/lib/ffmpeg/plan";
import { buildAudioFilterChain } from "@/lib/ffmpeg/audio-filters";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import { resolveLoudnessGain } from "@/lib/ffmpeg/render-job";
import type { AudioSettings } from "@/types/audio-settings";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import { previewWindow } from "@/lib/timeline/preview-window";

/** Length of the before/after sample, in edited (post-cut) seconds. */
export const AUDIO_PREVIEW_SECONDS = 15;

function previewPaths(projectId: string, jobId: string) {
  const dir = path.posix.join("projects", projectId, "render");
  return {
    dir,
    after: path.posix.join(dir, `preview-${jobId}.m4a`),
    before: path.posix.join(dir, `preview-${jobId}-before.m4a`),
  };
}

/** Deletes a finished preview's two files -- previews are throwaway, only the latest is kept. */
export async function deleteAudioPreviewFiles(projectId: string, jobId: string): Promise<void> {
  const { after, before } = previewPaths(projectId, jobId);
  await Promise.all([rm(resolveInDataDir(after), { force: true }), rm(resolveInDataDir(before), { force: true })]);
}

/**
 * Renders a short before/after audio sample for the Audio panel: the same
 * stretch of the edited program once untouched and once through the
 * cleanup chain, so the difference can be heard without a full export.
 * The browser can't run these ffmpeg filters live, so this is the preview.
 *
 * Loudness is measured over the sample itself rather than the whole episode
 * -- a whole-episode pass would make a 15s preview take as long as an
 * export's analysis. For speech this lands within a dB or so of the real
 * export.
 *
 * Runs fire-and-forget from the route, tracked on its RenderJob row
 * (kind "audio-preview"), like a normal export.
 */
export async function runAudioPreviewJob(jobId: string, start: number, settings: AudioSettings): Promise<void> {
  try {
    const job = await prisma.renderJob.update({ where: { id: jobId }, data: { status: "processing" } });
    const project = await prisma.project.findUnique({
      where: { id: job.projectId },
      include: { assets: true, editOperations: true },
    });
    if (!project) throw new Error("Project not found.");
    if (project.duration === null) throw new Error("Video duration isn't known yet -- open the project once first.");
    const originalAsset = project.assets.find((a) => a.kind === "original");
    if (!originalAsset) throw new Error("No source video for this project.");

    const cuts = project.editOperations
      .map((op) => JSON.parse(op.dataJson) as EditOperation)
      .filter((op): op is CutOperation => op.type === "cut");
    const window = previewWindow(computePlayableRanges(project.duration, cuts), start, AUDIO_PREVIEW_SECONDS);
    if (window.length === 0) throw new Error("Nothing to preview -- the entire video has been cut.");

    const inputPath = resolveInDataDir(originalAsset.filePath);
    const paths = previewPaths(project.id, jobId);
    await mkdir(resolveInDataDir(paths.dir), { recursive: true });

    const audioFilter = buildAudioFilterChain(settings, await resolveLoudnessGain(inputPath, window, settings, jobId));
    await runFfmpeg(
      buildAudioOnlyRenderArgs({ inputPath, outputPath: resolveInDataDir(paths.before), playableRanges: window })
    );
    await runFfmpeg(
      buildAudioOnlyRenderArgs({
        inputPath,
        outputPath: resolveInDataDir(paths.after),
        playableRanges: window,
        audioFilter,
      })
    );

    await prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "completed", outputPath: paths.after, error: null },
    });
  } catch (err) {
    logger.error(`Audio preview ${jobId} failed:`, err);
    await prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "failed", error: err instanceof Error ? err.message : "Preview failed for an unknown reason." },
    });
  }
}
