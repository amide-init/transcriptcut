import type { PlayableRange } from "@/types/timeline";
import { getFfmpegFilter } from "@/lib/ffmpeg/filters";
import { buildPropertiesFilter } from "@/lib/ffmpeg/properties";
import { buildForceStyle, type CaptionStyle } from "@/lib/captions/style";
import {
  LOGO_MAX_HEIGHT_FRACTION,
  LOGO_MAX_WIDTH_FRACTION,
  LOGO_PADDING_MAX_PERCENT,
  LOGO_PADDING_MIN_PERCENT,
  logoPositionToOverlayXY,
  type LogoPosition,
} from "@/lib/video/logo";
import type { VideoProperties } from "@/types/video-properties";

/**
 * How much of each cut is smoothed with a crossfade instead of a hard
 * splice. Blends the existing tail of the segment before the cut into the
 * existing head of the segment after it -- no footage from the removed
 * region itself is used, so it stays truthful to what survived the edit.
 *
 * Deliberately short: this is footage of people talking, not music, so a
 * long crossfade means two different words are audibly playing on top of
 * each other for its whole duration (confirmed: 0.2s was long enough for
 * that overlap to be clearly audible as doubled/muddled speech). 30ms is
 * the kind of duration audio editors use for a "declick" crossfade -- just
 * enough to smooth the raw waveform-amplitude discontinuity a hard splice
 * can leave at the join (which is what actually causes an audible click/
 * pop, not the cut itself), short enough that two overlapping words aren't
 * perceptible as anything other than a clean cut.
 */
const CUT_CROSSFADE_SECONDS = 0.03;

/** Percent of frame width/height, not raw pixels -- see lib/video/logo.ts. */
function clampPaddingPercent(v: number): number {
  return Math.min(LOGO_PADDING_MAX_PERCENT, Math.max(LOGO_PADDING_MIN_PERCENT, v));
}

function clampOpacity(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * Escapes a file path for use as the subtitles filter's filename option.
 * The filtergraph parser uses ':' as an option separator and '\' as its
 * own escape character, so a Windows-style absolute path (drive-letter
 * colon, backslash separators) would otherwise break the filter string.
 * Converting backslashes to '/' first is safe -- ffmpeg accepts forward
 * slashes on Windows too -- then any remaining ':' (the drive letter) is
 * escaped for the parser.
 */
function escapeSubtitlesPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * Escapes a filtergraph option value (e.g. force_style). Values here are
 * always built from lib/captions/style.ts#buildForceStyle -- a whitelisted
 * font, clamped numeric size, and algorithmically-derived hex colors -- so
 * none of this should ever fire in practice. It's still here per spec
 * section 18: sanitize and validate all FFmpeg parameters, defense in depth
 * rather than trusting the caller.
 */
function escapeFilterOptionValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function assertValidRanges(playableRanges: PlayableRange[]): void {
  if (playableRanges.length === 0) {
    throw new Error("Nothing to render -- the entire video has been cut.");
  }
  for (const r of playableRanges) {
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end <= r.start) {
      throw new Error(`Invalid playable range: ${JSON.stringify(r)}`);
    }
  }
}

/**
 * Crossfade length at each join: entry i is the fade between range i-1 and
 * range i (entry 0 is unused). Each is clamped to at most half of either
 * adjacent segment's own (pre-join) length, so a short surviving sliver
 * between two nearby cuts can't make the transition eat more than that
 * sliver. Shared by the video and audio graphs so they stay in sync.
 */
function computeCrossfades(playableRanges: PlayableRange[]): number[] {
  return playableRanges.map((r, i) => {
    if (i === 0) return 0;
    const previous = playableRanges[i - 1];
    return Math.min(CUT_CROSSFADE_SECONDS, (previous.end - previous.start) / 2, (r.end - r.start) / 2);
  });
}

/** atrim + acrossfade chains ending in [outa]: the edited program's audio, before any cleanup. */
function buildAudioEditChains(playableRanges: PlayableRange[]): string[] {
  const chains = playableRanges.map(
    (r, i) => `[0:a]atrim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
  );
  if (playableRanges.length === 1) {
    chains.push("[a0]anull[outa]");
    return chains;
  }
  const crossfades = computeCrossfades(playableRanges);
  let label = "a0";
  for (let i = 1; i < playableRanges.length; i++) {
    const next = i === playableRanges.length - 1 ? "outa" : `ax${i}`;
    chains.push(`[${label}][a${i}]acrossfade=d=${crossfades[i].toFixed(3)}[${next}]`);
    label = next;
  }
  return chains;
}

/**
 * ffmpeg argv for loudnorm's first (measure-only) pass over the edited
 * program's audio, with the same cuts/crossfades and pre-loudness cleanup
 * the export will apply -- so the second pass targets exactly what ships.
 * Writes no file; the measurement is printed to stderr as JSON.
 */
export function buildLoudnessAnalysisArgs(args: {
  inputPath: string;
  playableRanges: PlayableRange[];
  /** From audio-filters.ts#buildLoudnessAnalysisChain. */
  analysisChain: string;
}): string[] {
  assertValidRanges(args.playableRanges);
  const chains = [...buildAudioEditChains(args.playableRanges), `[outa]${args.analysisChain}[analysis]`];
  return ["-i", args.inputPath, "-filter_complex", chains.join(";"), "-map", "[analysis]", "-f", "null", "-"];
}

/** Encoder settings per audio-only output container. */
const AUDIO_ONLY_CODEC_ARGS: Record<"m4a" | "mp3" | "wav", string[]> = {
  m4a: ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"],
  // 44.1kHz is the podcast-host norm, and at lower source rates (e.g. 22.05kHz)
  // MP3 can't reach 192k -- measured: a 22.05kHz source came out at 160k.
  // ID3v2.3 is what podcast apps and hosts read most reliably (v2.4 support is patchy).
  mp3: ["-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", "-id3v2_version", "3"],
  wav: ["-c:a", "pcm_s16le"],
};

/**
 * ffmpeg argv for an audio-only render of the edited program, with the same
 * cuts/crossfades as the video export and an optional cleanup chain. Used
 * for MP3/WAV podcast exports and the before/after audio preview (m4a).
 *
 * metadataPath, when given, is an FFMETADATA file (lib/publishing/chapters.ts
 * #toFfmetadata) whose title and chapter markers are copied into the output.
 * Ignored for WAV, which has no chapter support.
 */
export function buildAudioOnlyRenderArgs(args: {
  inputPath: string;
  outputPath: string;
  playableRanges: PlayableRange[];
  audioFilter?: string | null;
  format?: "m4a" | "mp3" | "wav";
  metadataPath?: string;
}): string[] {
  assertValidRanges(args.playableRanges);
  const format = args.format ?? "m4a";
  const chains = buildAudioEditChains(args.playableRanges);
  let label = "[outa]";
  if (args.audioFilter) {
    chains.push(`[outa]${args.audioFilter}[cleana]`);
    label = "[cleana]";
  }
  const metadataPath = format === "wav" ? undefined : args.metadataPath;
  return [
    "-y",
    "-i",
    args.inputPath,
    ...(metadataPath ? ["-i", metadataPath] : []),
    "-filter_complex",
    chains.join(";"),
    "-map",
    label,
    ...(metadataPath ? ["-map_metadata", "1", "-map_chapters", "1"] : []),
    ...AUDIO_ONLY_CODEC_ARGS[format],
    args.outputPath,
  ];
}

/**
 * Builds the full ffmpeg argv (as an array, never a shell string) for
 * rendering a project: cut out everything except the playable ranges
 * (the same ranges the browser preview computes via
 * lib/timeline/cuts.ts#computePlayableRanges, so what renders matches
 * what was previewed), concatenate what's left, and apply the selected
 * filter preset and, optionally, burned-in captions.
 *
 * Returns an argv array for execFile -- never build a shell command
 * string from these values (spec section 18: never interpolate
 * user/AI-provided strings into a shell command). Every timestamp is
 * validated as finite and in range before it touches the argv.
 */
export function buildRenderArgs(args: {
  inputPath: string;
  outputPath: string;
  playableRanges: PlayableRange[];
  filterId: string;
  /** Manual color-adjustment sliders, layered on top of the filter preset. */
  properties?: VideoProperties;
  /**
   * Absolute path to a subtitle file to burn in, if captions were requested.
   * Usually .srt; for word-highlight it's a self-styled .ass with karaoke
   * tags (see lib/captions/format.ts#toAssKaraoke) -- in that case pass
   * captionStyle as undefined, since the file's own style line already has
   * everything and force_style would fight the per-word \k color tags.
   */
  srtPath?: string;
  /** Caption style to burn in via force_style; ignored unless srtPath is also set. */
  captionStyle?: CaptionStyle;
  /** Absolute path to a logo/watermark image to overlay, if one is set. */
  logoPath?: string;
  logoPosition?: LogoPosition;
  /** Percent of frame width/height, not raw pixels -- see lib/video/logo.ts. */
  logoPaddingX?: number;
  logoPaddingY?: number;
  /** 0-100, defaults to fully opaque. */
  logoOpacity?: number;
  /**
   * Source video's pixel dimensions (from ffmpeg/probe.ts#probeVideoDimensions).
   * Required whenever logoPath/logoPosition are set (caps the logo's export
   * size to the same fraction of the frame the live preview uses -- without
   * it the logo composites at its native resolution) and whenever srtPath +
   * captionStyle are both set (force_style's FontSize/MarginV are literal
   * output pixels with no built-in scaling, so they need the real output
   * height to convert captionStyle.fontSize's percent into pixels).
   */
  videoWidth?: number;
  videoHeight?: number;
  /**
   * Audio cleanup chain applied to the edited audio (from
   * audio-filters.ts#buildAudioFilterChain), or null/undefined for none.
   */
  audioFilter?: string | null;
  /** FFMETADATA file with the episode title and chapter markers to embed (see buildAudioOnlyRenderArgs). */
  metadataPath?: string;
}): string[] {
  const {
    inputPath,
    outputPath,
    playableRanges,
    filterId,
    properties,
    srtPath,
    captionStyle,
    logoPath,
    logoPosition,
    logoPaddingX,
    logoPaddingY,
    logoOpacity,
    videoWidth,
    videoHeight,
    audioFilter,
    metadataPath,
  } = args;

  assertValidRanges(playableRanges);

  const filterChains: string[] = [];
  playableRanges.forEach((r, i) => {
    filterChains.push(`[0:v]trim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  });

  if (playableRanges.length === 1) {
    filterChains.push(`[v0]null[outv]`);
  } else {
    // Chain xfade pairwise across every cut instead of a plain concat.
    // xfade's offset is where the transition starts inside the
    // *combined-so-far* stream, so it has to be tracked cumulatively as
    // each pair is joined (this is the standard idiom for chaining more
    // than one xfade) -- verified against a real ffmpeg render, not just
    // the filter's documented options, since offset math like this is easy
    // to get subtly wrong. The audio side uses the same crossfade lengths
    // (see buildAudioEditChains).
    const crossfades = computeCrossfades(playableRanges);
    let videoLabel = "v0";
    let cumulativeDuration = playableRanges[0].end - playableRanges[0].start;
    for (let i = 1; i < playableRanges.length; i++) {
      const segmentDuration = playableRanges[i].end - playableRanges[i].start;
      const crossfade = crossfades[i];
      const offset = (cumulativeDuration - crossfade).toFixed(3);
      const nextVideoLabel = i === playableRanges.length - 1 ? "outv" : `vx${i}`;
      filterChains.push(
        `[${videoLabel}][v${i}]xfade=transition=fade:duration=${crossfade.toFixed(3)}:offset=${offset}[${nextVideoLabel}]`
      );
      videoLabel = nextVideoLabel;
      cumulativeDuration = cumulativeDuration + segmentDuration - crossfade;
    }
  }

  filterChains.push(...buildAudioEditChains(playableRanges));
  let audioOutLabel = "[outa]";
  if (audioFilter) {
    filterChains.push(`[outa]${audioFilter}[cleana]`);
    audioOutLabel = "[cleana]";
  }

  let videoOutLabel = "[outv]";
  const presetFilter = getFfmpegFilter(filterId);
  const propertiesFilter = properties ? buildPropertiesFilter(properties) : null;
  const colorFilter = [presetFilter, propertiesFilter].filter(Boolean).join(",");
  if (colorFilter) {
    filterChains.push(`[outv]${colorFilter}[filtered]`);
    videoOutLabel = "[filtered]";
  }

  if (srtPath) {
    // force_style's FontSize/MarginV are literal, un-scaled output pixels
    // -- verified empirically that ffmpeg's `original_size` option does
    // NOT rescale them (byte-identical renders with/without it), unlike
    // toAssKaraoke's ASS PlayResX/Y (a real libass feature, confirmed
    // separately to actually rescale). So captionStyle's percent-of-frame
    // fontSize needs the render's actual output height to convert to a
    // literal pixel FontSize here.
    if (captionStyle && !videoHeight) {
      throw new Error("Captions requested but the source video's dimensions are unknown.");
    }
    // filename= must be explicit -- a bare positional quoted value here
    // (`subtitles='path'`) fails to parse on newer ffmpeg builds as soon as
    // a second, colon-separated option (force_style) follows it.
    const styleOption = captionStyle
      ? `:force_style='${escapeFilterOptionValue(buildForceStyle(captionStyle, videoHeight!))}'`
      : "";
    filterChains.push(
      `${videoOutLabel}subtitles=filename='${escapeSubtitlesPath(srtPath)}'${styleOption}[captioned]`
    );
    videoOutLabel = "[captioned]";
  }

  // Overlaid last (on top of color grading and captions) -- a watermark
  // should stay visible even if a caption happens to sit in the same corner.
  if (logoPath && logoPosition) {
    if (!videoWidth || !videoHeight) {
      throw new Error("Logo overlay requested but the source video's dimensions are unknown.");
    }
    const { x, y } = logoPositionToOverlayXY(
      logoPosition,
      clampPaddingPercent(logoPaddingX ?? 0),
      clampPaddingPercent(logoPaddingY ?? 0)
    );
    // overlay= has no opacity option of its own -- premultiply the logo
    // input's alpha channel first so a partial-opacity watermark blends
    // instead of fully replacing the pixels underneath it.
    const opacityFraction = (clampOpacity(logoOpacity ?? 100) / 100).toFixed(3);
    // Cap the logo to the same fraction of the frame the live preview uses
    // (VideoPlayer.tsx's max-w/max-h CSS via lib/video/logo.ts's shared
    // fractions), preserving aspect ratio and never upscaling past the
    // source image's native size -- "min(1, ...)" is what prevents the
    // upscale. Without this, the logo is composited at its native pixel
    // resolution, which for a typical high-res watermark looks far bigger
    // than the preview. Rounded to even pixels ("trunc(.../2)*2") since odd
    // overlay dimensions can misalign chroma subsampling on the base video.
    const maxLogoWidth = Math.round(videoWidth * LOGO_MAX_WIDTH_FRACTION);
    const maxLogoHeight = Math.round(videoHeight * LOGO_MAX_HEIGHT_FRACTION);
    const scaleFactor = `min(1,min(${maxLogoWidth}/iw,${maxLogoHeight}/ih))`;
    filterChains.push(
      `[1:v]format=rgba,scale=w='trunc(iw*${scaleFactor}/2)*2':h='trunc(ih*${scaleFactor}/2)*2',colorchannelmixer=aa=${opacityFraction}[logosrc]`
    );
    filterChains.push(`${videoOutLabel}[logosrc]overlay=x=${x}:y=${y}[logoed]`);
    videoOutLabel = "[logoed]";
  }

  // The metadata file is the last input: after the source and, if present, the logo.
  const metadataInputIndex = String(logoPath && logoPosition ? 2 : 1);

  return [
    "-y",
    "-i",
    inputPath,
    ...(logoPath && logoPosition ? ["-i", logoPath] : []),
    ...(metadataPath ? ["-i", metadataPath] : []),
    "-filter_complex",
    filterChains.join(";"),
    "-map",
    videoOutLabel,
    "-map",
    audioOutLabel,
    ...(metadataPath ? ["-map_metadata", metadataInputIndex, "-map_chapters", metadataInputIndex] : []),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
