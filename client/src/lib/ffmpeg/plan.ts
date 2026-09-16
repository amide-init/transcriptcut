import type { PlayableRange } from "@/types/timeline";
import { getFfmpegFilter } from "@/lib/ffmpeg/filters";
import { buildForceStyle, type CaptionStyle } from "@/lib/captions/style";

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
  /** Absolute path to an .srt file to burn in, if captions were requested. */
  srtPath?: string;
  /** Caption style to burn in; ignored unless srtPath is also set. */
  captionStyle?: CaptionStyle;
}): string[] {
  const { inputPath, outputPath, playableRanges, filterId, srtPath, captionStyle } = args;

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
  const ffmpegFilter = getFfmpegFilter(filterId);
  if (ffmpegFilter) {
    filterChains.push(`[outv]${ffmpegFilter}[filtered]`);
    videoOutLabel = "[filtered]";
  }

  if (srtPath) {
    // filename= must be explicit -- a bare positional quoted value here
    // (`subtitles='path'`) fails to parse on newer ffmpeg builds as soon as
    // a second, colon-separated option (force_style) follows it.
    const styleOption = captionStyle
      ? `:force_style='${escapeFilterOptionValue(buildForceStyle(captionStyle))}'`
      : "";
    filterChains.push(
      `${videoOutLabel}subtitles=filename='${escapeSubtitlesPath(srtPath)}'${styleOption}[captioned]`
    );
    videoOutLabel = "[captioned]";
  }

  return [
    "-y",
    "-i",
    inputPath,
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
