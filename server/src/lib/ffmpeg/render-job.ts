import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, statAsset } from "@/lib/storage/local";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import { buildAudioOnlyRenderArgs, buildLoudnessAnalysisArgs, buildRenderArgs } from "@/lib/ffmpeg/plan";
import { resolveChapters, toFfmetadata } from "@/lib/publishing/chapters";
import { clipAsCuts } from "@/lib/clips/clips";
import { captionStyleSchema } from "@/lib/validation/caption-style";
import { CLIP_ASPECTS, CLIP_OUTPUT_SIZE, type ClipAspect } from "@/types/clips";
import { getEditedDuration } from "@/lib/timeline/cuts";
import { exportFormatSchema } from "@/lib/validation/publishing";
import type { Chapter, ExportFormat } from "@/types/publishing";
import {
  buildAudioFilterChain,
  buildLoudnessAnalysisChain,
  clampGainDb,
  gainToTarget,
  loudnessTargetLufs,
  parseMeasuredLoudness,
} from "@/lib/ffmpeg/audio-filters";
import { parseStoredAudioSettings } from "@/lib/validation/audio-settings";
import { runFfmpeg, runFfmpegCapturingStderr } from "@/lib/ffmpeg/run";
import { probeVideoStream } from "@/lib/ffmpeg/probe";
import { generateCaptions, splitCuesForShorts } from "@/lib/captions/generate";
import { toAssKaraoke, toSrt } from "@/lib/captions/format";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/captions/style";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";
import { toLogoPosition } from "@/lib/video/logo";
import type { CutOperation, EditOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";
import type { PlayableRange } from "@/types/timeline";
import type { AudioSettings } from "@/types/audio-settings";

/** Close enough to the loudness target to stop correcting (in LU). */
const LOUDNESS_TOLERANCE_LU = 0.3;
const MAX_LOUDNESS_CORRECTIONS = 3;
/**
 * How far correction steps may push past the first (unlimited) gain
 * estimate. Past this the limiter is squashing so hard that, after AAC
 * encoding, peaks overshoot the ceiling -- measured: +8.5dB of extra gain on
 * a very quiet, noisy source clipped at +0.7 dBTP. Missing the loudness
 * target by a little is far better than clipping.
 */
const MAX_CORRECTION_ABOVE_ESTIMATE_DB = 6;

/**
 * Finds the gain that puts the edited, cleaned-up audio on its loudness
 * target. Measures the audio, applies target-minus-measured through the
 * real gain + limiter chain, then corrects with secant steps: once the
 * limiter is working hard, each extra dB of gain buys less than a dB of
 * loudness, so the step uses the gain-to-loudness slope observed between
 * the last two passes instead of assuming 1:1 (plain top-ups measured
 * -14.5 LUFS after three passes on a -14 target; secant steps converge).
 * Each pass decodes audio only, so it's quick next to the video encode.
 *
 * Undefined when no target is set, or when measuring fails or finds only
 * silence -- the render then uses single-pass loudnorm, which still lands
 * close.
 */
export async function resolveLoudnessGain(
  inputPath: string,
  playableRanges: PlayableRange[],
  audioSettings: AudioSettings,
  jobId: string
): Promise<number | undefined> {
  const target = loudnessTargetLufs(audioSettings);
  if (target === null) return undefined;

  const measure = async (gainDb?: number) => {
    const analysisChain = buildLoudnessAnalysisChain(audioSettings, gainDb)!;
    const stderr = await runFfmpegCapturingStderr(
      buildLoudnessAnalysisArgs({ inputPath, playableRanges, analysisChain })
    );
    return parseMeasuredLoudness(stderr);
  };

  try {
    const initial = await measure();
    if (initial === null) {
      logger.warn(`Render ${jobId}: no usable loudness measurement; using single-pass loudnorm.`);
      return undefined;
    }
    // Each point is (gain applied, loudness measured). At gain 0 the limiter
    // barely engages, so the unprocessed measurement serves as the first.
    let previous = { gain: 0, lufs: initial };
    const estimate = gainToTarget(target, initial);
    const ceiling = estimate + MAX_CORRECTION_ABOVE_ESTIMATE_DB;
    let gain = estimate;
    for (let i = 0; i < MAX_LOUDNESS_CORRECTIONS; i++) {
      const lufs = await measure(gain);
      if (lufs === null || Math.abs(target - lufs) <= LOUDNESS_TOLERANCE_LU) break;
      const observedSlope = (lufs - previous.lufs) / (gain - previous.gain);
      // Clamp: noise in a short measurement must not send the next step wild.
      const slope = Number.isFinite(observedSlope) ? Math.min(1, Math.max(0.25, observedSlope)) : 1;
      previous = { gain, lufs };
      gain = Math.min(ceiling, clampGainDb(gain + (target - lufs) / slope));
    }
    return gain;
  } catch (err) {
    logger.warn(`Render ${jobId}: loudness measurement failed; using single-pass loudnorm.`, err);
    return undefined;
  }
}

/**
 * Shorts captions sit higher than normal (clear of the app's bottom UI),
 * with side margins and a heavier outline -- measured on a 9:16 render, the
 * default 2px outline was too thin to read over busy footage at phone size.
 */
const SHORTS_CAPTION_MARGINS = { marginVPercent: 18, marginHPercent: 7, outline: 5 };

/**
 * The project's caption look (font, colors, background), scaled up for
 * phone screens, with word highlight on -- the Shorts/Reels style.
 */
function shortsCaptionStyle(captionStyleJson: string | null): CaptionStyle {
  const parsed = captionStyleJson ? captionStyleSchema.safeParse(JSON.parse(captionStyleJson)) : null;
  const base = parsed?.success ? parsed.data : DEFAULT_CAPTION_STYLE;
  return { ...base, fontSize: 5.5, position: "bottom", wordHighlight: true };
}

function toClipAspect(value: string): ClipAspect {
  return (CLIP_ASPECTS as readonly string[]).includes(value) ? (value as ClipAspect) : "9:16";
}

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

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

    const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: jobId }, include: { clip: true } });
    if (job.clipId && !job.clip) throw new Error("This clip no longer exists.");
    const clip = job.clip;
    const project = await prisma.project.findUnique({
      where: { id: job.projectId },
      include: { assets: true, editOperations: true, transcript: true, publishingMeta: true },
    });
    if (!project) throw new Error("Project not found.");
    const parsedFormat = exportFormatSchema.safeParse(job.format);
    const format: ExportFormat = parsedFormat.success ? parsedFormat.data : "mp4";
    // Clips are always video.
    const isVideo = format === "mp4" || clip !== null;
    if (project.duration === null) throw new Error("Video duration isn't known yet -- open the project once first.");

    const originalAsset = project.assets.find((a) => a.kind === "original");
    if (!originalAsset) throw new Error("No source video for this project.");
    const logoAsset = project.assets.find((a) => a.kind === "logo");

    // A clip is rendered as the project with everything outside it cut too,
    // so the project's own edits still apply inside the clip.
    const cuts = [
      ...project.editOperations
        .map((op) => JSON.parse(op.dataJson) as EditOperation)
        .filter((op): op is CutOperation => op.type === "cut"),
      ...(clip ? clipAsCuts(clip, project.duration) : []),
    ];
    const playableRanges = computePlayableRanges(project.duration, cuts);

    const inputPath = resolveInDataDir(originalAsset.filePath);
    const outputRelativePath = path.posix.join(
      "projects",
      project.id,
      "render",
      clip ? `clip-${jobId}.mp4` : `${jobId}.${format}`
    );
    const outputPath = resolveInDataDir(outputRelativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    let subtitlesPath: string | undefined;
    // Word-highlight needs per-word timing/color, which plain SRT can't carry --
    // burn it in as a self-styled .ass file with libass karaoke (\k) tags instead,
    // and skip force_style entirely (the file's own [V4+ Styles] line already has
    // the chosen font/size/colors/position/background baked in).
    // Captions, logo and color are video-only; an MP3/WAV export skips them.
    const burnInCaptions = clip ? clip.captions : isVideo && options.burnInCaptions;
    const useLogo = isVideo && Boolean(logoAsset);
    const clipAspect = clip ? toClipAspect(clip.aspect) : null;
    const clipFrame = clipAspect ? CLIP_OUTPUT_SIZE[clipAspect] : null;
    // Clips always use word-highlight Shorts captions, laid out for the clip's own frame.
    const captionStyle = clip ? shortsCaptionStyle(project.captionStyleJson) : options.captionStyle;
    const useKaraoke = burnInCaptions && captionStyle?.wordHighlight === true;

    // Every video render needs the source's frame rate (see ffmpeg/plan.ts).
    // The same probe gives its size, which sizes the logo overlay and
    // converts force_style's percent-of-frame font size/margin into output
    // pixels. A clip's output size is known up front, so it's used instead.
    const sourceStream = isVideo ? await probeVideoStream(inputPath) : undefined;
    const videoDimensions = clipFrame ?? sourceStream;

    if (burnInCaptions) {
      if (!project.transcript) throw new Error("Captions were requested but this project has no transcript.");
      const transcript: Transcript = {
        id: project.transcript.id,
        segments: JSON.parse(project.transcript.segmentsJson),
      };
      const sentenceCues = generateCaptions(transcript, cuts, project.duration);
      const cues = clip ? splitCuesForShorts(sentenceCues) : sentenceCues;
      const subtitleExt = useKaraoke ? "ass" : "srt";
      const subtitleRelativePath = path.posix.join("projects", project.id, "render", `${jobId}.${subtitleExt}`);
      subtitlesPath = resolveInDataDir(subtitleRelativePath);
      const contents = useKaraoke
        ? toAssKaraoke(
            cues,
            captionStyle ?? DEFAULT_CAPTION_STYLE,
            clipFrame ? { ...clipFrame, ...SHORTS_CAPTION_MARGINS } : undefined
          )
        : toSrt(cues);
      await writeFile(subtitlesPath, contents, "utf-8");
    }

    const audioSettings = parseStoredAudioSettings(project.audioSettingsJson);
    const audioFilter = buildAudioFilterChain(
      audioSettings,
      await resolveLoudnessGain(inputPath, playableRanges, audioSettings, jobId)
    );

    // Episode title + chapter markers, embedded so podcast apps and players
    // show them. Chapters are stored in source time and placed on the edited
    // timeline here, so they follow whatever cuts were made after generation.
    const chapters: Chapter[] = project.publishingMeta?.chaptersJson
      ? JSON.parse(project.publishingMeta.chaptersJson)
      : [];
    // Clips are standalone excerpts: the episode's chapters and title don't apply.
    let metadataPath: string | undefined;
    if (!clip) {
      metadataPath = resolveInDataDir(path.posix.join("projects", project.id, "render", `${jobId}.ffmeta`));
      await writeFile(
        metadataPath,
        toFfmetadata(resolveChapters(chapters, playableRanges), getEditedDuration(playableRanges), project.name),
        "utf-8"
      );
    }

    const args = isVideo
      ? buildRenderArgs({
          inputPath,
          outputPath,
          playableRanges,
          filterId: project.filterId,
          properties: project.propertiesJson ? JSON.parse(project.propertiesJson) : DEFAULT_VIDEO_PROPERTIES,
          srtPath: subtitlesPath,
          captionStyle: subtitlesPath && !useKaraoke ? (captionStyle ?? DEFAULT_CAPTION_STYLE) : undefined,
          logoPath: useLogo ? resolveInDataDir(logoAsset!.filePath) : undefined,
          logoPosition: useLogo ? toLogoPosition(project.logoPosition) : undefined,
          logoPaddingX: useLogo ? project.logoPaddingX : undefined,
          logoPaddingY: useLogo ? project.logoPaddingY : undefined,
          logoOpacity: useLogo ? project.logoOpacity : undefined,
          videoWidth: videoDimensions?.width,
          videoHeight: videoDimensions?.height,
          audioFilter,
          metadataPath,
          reframe: clip && clipFrame ? { ...clipFrame, cropX: clip.cropX } : undefined,
          frameRate: sourceStream!.fps,
        })
      : buildAudioOnlyRenderArgs({ inputPath, outputPath, playableRanges, audioFilter, format, metadataPath });
    await runFfmpeg(args);

    const stats = await statAsset(outputRelativePath);
    await prisma.asset.create({
      data: {
        projectId: project.id,
        kind: "render",
        filePath: outputRelativePath,
        mimeType: clip ? "video/mp4" : EXPORT_MIME_TYPES[format],
        sizeBytes: stats.size,
      },
    });

    await prisma.renderJob.update({
      where: { id: jobId },
      data: { status: "completed", outputPath: outputRelativePath, error: null },
    });
  } catch (err) {
    logger.error(`Render job ${jobId} failed:`, err);
    await prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : "Render failed for an unknown reason.",
      },
    });
  }
}
