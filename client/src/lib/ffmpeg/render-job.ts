import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, statAsset } from "@/lib/storage/local";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import { buildRenderArgs } from "@/lib/ffmpeg/plan";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

/**
 * Runs one render job to completion and updates its RenderJob row along the
 * way (queued -> processing -> completed/failed). Called fire-and-forget
 * from the render API route -- never awaited by the request handler, per
 * spec section 14: never block the API request on FFmpeg.
 */
export async function runRenderJob(jobId: string): Promise<void> {
  try {
    await prisma.renderJob.update({ where: { id: jobId }, data: { status: "processing" } });

    const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId } });
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
    const playableRanges = computePlayableRanges(project.duration, cuts);

    const inputPath = resolveInDataDir(originalAsset.filePath);
    const outputRelativePath = path.posix.join("projects", project.id, "render", `${jobId}.mp4`);
    const outputPath = resolveInDataDir(outputRelativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    const args = buildRenderArgs({
      inputPath,
      outputPath,
      playableRanges,
      filterId: project.filterId,
    });
    await runFfmpeg(args);

    const stats = await statAsset(outputRelativePath);
    await prisma.asset.create({
      data: {
        projectId: project.id,
        kind: "render",
        filePath: outputRelativePath,
        mimeType: "video/mp4",
        sizeBytes: stats.size,
      },
    });

    await prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "completed", outputPath: outputRelativePath, error: null },
    });
  } catch (err) {
    console.error(`Render job ${jobId} failed:`, err);
    await prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Render failed for an unknown reason.",
      },
    });
  }
}
