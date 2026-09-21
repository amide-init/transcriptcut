import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, statAsset } from "@/lib/storage/local";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import { buildRenderArgs } from "@/lib/ffmpeg/plan";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import { generateCaptions } from "@/lib/captions/generate";
import { toAssKaraoke, toSrt } from "@/lib/captions/format";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/captions/style";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";
import { toLogoPosition } from "@/lib/video/logo";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

/**
 * Runs one render job to completion and updates its RenderJob row along the
 * way (queued -> processing -> completed/failed). Called fire-and-forget
 * from the render API route -- never awaited by the request handler, per
 * spec section 14: never block the API request on FFmpeg.
 */
export async function runRenderJob(
  jobId: string,
  options: { burnInCaptions?: boolean; captionStyle?: CaptionStyle } = {}
): Promise<void> {
  try {
    await prisma.renderJob.update({ where: { id: jobId }, data: { status: "processing" } });

    const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId } });
    const project = await prisma.project.findUnique({
      where: { id: job.projectId },
      include: { assets: true, editOperations: true, transcript: true },
    });
    if (!project) throw new Error("Project not found.");
    if (project.duration === null) throw new Error("Video duration isn't known yet -- open the project once first.");

    const originalAsset = project.assets.find((a) => a.kind === "original");
    if (!originalAsset) throw new Error("No source video for this project.");
    const logoAsset = project.assets.find((a) => a.kind === "logo");

    const cuts = project.editOperations
      .map((op) => JSON.parse(op.dataJson) as EditOperation)
      .filter((op): op is CutOperation => op.type === "cut");
    const playableRanges = computePlayableRanges(project.duration, cuts);

    const inputPath = resolveInDataDir(originalAsset.filePath);
    const outputRelativePath = path.posix.join("projects", project.id, "render", `${jobId}.mp4`);
    const outputPath = resolveInDataDir(outputRelativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    let subtitlesPath: string | undefined;
    // Word-highlight needs per-word timing/color, which plain SRT can't carry --
    // burn it in as a self-styled .ass file with libass karaoke (\k) tags instead,
    // and skip force_style entirely (the file's own [V4+ Styles] line already has
    // the chosen font/size/colors/position/background baked in).
    const useKaraoke = options.burnInCaptions && options.captionStyle?.wordHighlight === true;
    if (options.burnInCaptions) {
      if (!project.transcript) throw new Error("Captions were requested but this project has no transcript.");
      const transcript: Transcript = {
        id: project.transcript.id,
        segments: JSON.parse(project.transcript.segmentsJson),
      };
      const cues = generateCaptions(transcript, cuts, project.duration);
      const subtitleExt = useKaraoke ? "ass" : "srt";
      const subtitleRelativePath = path.posix.join("projects", project.id, "render", `${jobId}.${subtitleExt}`);
      subtitlesPath = resolveInDataDir(subtitleRelativePath);
      const contents = useKaraoke
        ? toAssKaraoke(cues, options.captionStyle ?? DEFAULT_CAPTION_STYLE)
        : toSrt(cues);
      await writeFile(subtitlesPath, contents, "utf-8");
    }

    const args = buildRenderArgs({
      inputPath,
      outputPath,
      playableRanges,
      filterId: project.filterId,
      properties: project.propertiesJson ? JSON.parse(project.propertiesJson) : DEFAULT_VIDEO_PROPERTIES,
      srtPath: subtitlesPath,
      captionStyle: subtitlesPath && !useKaraoke ? (options.captionStyle ?? DEFAULT_CAPTION_STYLE) : undefined,
      logoPath: logoAsset ? resolveInDataDir(logoAsset.filePath) : undefined,
      logoPosition: logoAsset ? toLogoPosition(project.logoPosition) : undefined,
      logoPaddingX: logoAsset ? project.logoPaddingX : undefined,
      logoPaddingY: logoAsset ? project.logoPaddingY : undefined,
      logoOpacity: logoAsset ? project.logoOpacity : undefined,
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
