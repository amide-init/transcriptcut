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
  } = args;

  if (playableRanges.length === 0) {
    throw new Error("Nothing to render -- the entire video has been cut.");
  }
  for (const r of playableRanges) {
    if (!Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end <= r.start) {
      throw new Error(`Invalid playable range: ${JSON.stringify(r)}`);
    }
  }

  const filterChains: string[] = [];
  playableRanges.forEach((r, i) => {
    const start = r.start.toFixed(3);
    const end = r.end.toFixed(3);
    filterChains.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
    filterChains.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
  });

  const interleaved = playableRanges.map((_, i) => `[v${i}][a${i}]`).join("");
  filterChains.push(`${interleaved}concat=n=${playableRanges.length}:v=1:a=1[outv][outa]`);

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

  return [
    "-y",
    "-i",
    inputPath,
    ...(logoPath && logoPosition ? ["-i", logoPath] : []),
    "-filter_complex",
    filterChains.join(";"),
    "-map",
    videoOutLabel,
    "-map",
    "[outa]",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
