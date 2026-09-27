import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { resolveInDataDir } from "@/lib/storage/local";
import { runFfmpegCapturingStderr } from "@/lib/ffmpeg/run";

/**
 * Shot-change detection: where the picture cuts (camera switches in a
 * multicam podcast, a screen share starting). Used to land AI-suggested
 * scene boundaries on a visual cut instead of mid-shot.
 */

/** ffmpeg's scene score (0-1) above which a frame counts as a new shot. */
const SCENE_THRESHOLD = 0.35;
/** Frames are scored at this width: plenty for spotting a cut, and several times faster than 720p. */
const ANALYSIS_WIDTH = 320;
/** Two changes closer than this are one cut (a flash, a fast pan). */
const MIN_SHOT_SECONDS = 1;

/** Argv that prints a showinfo line for every frame scoring above the threshold. No output file. */
export function buildShotDetectionArgs(inputPath: string): string[] {
  return [
    "-hide_banner",
    "-nostats",
    "-i",
    inputPath,
    "-an",
    "-vf",
    `scale=${ANALYSIS_WIDTH}:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
    "-f",
    "null",
    "-",
  ];
}

/**
 * Shot-change times from showinfo's stderr, in order, with near-duplicates
 * merged and anything too close to either end of the video dropped.
 */
export function parseShotTimes(stderr: string, duration: number): number[] {
  const times = [...stderr.matchAll(/\bpts_time:\s*([0-9]+(?:\.[0-9]+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => Number.isFinite(t) && t >= MIN_SHOT_SECONDS && t <= duration - MIN_SHOT_SECONDS)
    .sort((a, b) => a - b);
  const shots: number[] = [];
  for (const t of times) {
    if (shots.length === 0 || t - shots[shots.length - 1] >= MIN_SHOT_SECONDS) shots.push(t);
  }
  return shots;
}

/**
 * Runs one shot-detection job to completion, storing the times on the job
 * row. Reads the 720p proxy when there is one (it decodes far faster than
 * a 4K original and cuts in the same places).
 */
export async function runShotJob(jobId: string): Promise<void> {
  try {
    const job = await prisma.transcriptionJob.update({ where: { id: jobId }, data: { status: "processing" } });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: job.projectId },
      include: { assets: true },
    });
    const video =
      project.assets.find((a) => a.kind === "proxy") ?? project.assets.find((a) => a.kind === "original");
    if (!video) throw new Error("No video for this project.");
    if (project.duration === null) throw new Error("Video duration isn't known yet -- open the project once first.");

    const stderr = await runFfmpegCapturingStderr(buildShotDetectionArgs(resolveInDataDir(video.filePath)));
    const shots = parseShotTimes(stderr, project.duration);
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: { status: "completed", resultJson: JSON.stringify(shots), error: null },
    });
  } catch (err) {
    logger.error(`Shot detection job ${jobId} failed:`, err);
    await prisma.transcriptionJob.update({
      where: { id: jobId },
      data: { status: "failed", error: err instanceof Error ? err.message : "Shot detection failed." },
    });
  }
}
