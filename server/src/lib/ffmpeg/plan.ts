import type { PlayableRange } from "@/types/timeline";
import type { Fade, Join, ProgramItem } from "@/lib/timeline/program";
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

/** Cloned frames after each segment but the last; see buildRenderArgs. */
const SEGMENT_TAIL_PAD = "tpad=stop_mode=clone:stop_duration=0.1";

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
 * What to render when it's more than the playable ranges cut together: the
 * program from lib/timeline/program.ts (cards, transitions, fades).
 */
export type RenderProgram = { items: ProgramItem[]; joins: Join[]; fadeIn: Fade | null; fadeOut: Fade | null };

function assertValidCardFrame(frame: { width: number; height: number }): void {
  const { width, height } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 8192 || height > 8192) {
    throw new Error(`Invalid card frame size: ${width}x${height}`);
  }
}

const assertSeconds = (seconds: number, what: string) => {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) throw new Error(`Invalid ${what} length.`);
};
const assertColor = (color: string) => {
  if (color !== "black" && color !== "white") throw new Error("Invalid transition color.");
};

/** Longest audio fade at a dip between items: speech sits right next to scene boundaries. */
const DIP_AUDIO_MAX_SECONDS = 0.3;
/** Longest audio fade at the very start or end of the episode. */
const EDGE_AUDIO_MAX_SECONDS = 1;

type ItemFade = { color: "black" | "white"; seconds: number; audioSeconds: number };

/**
 * Everything the video and audio graphs need to agree on, per item: how
 * long it renders, how much of it overlaps the item before, and any fade
 * at its edges. Shared so the two graphs stay in sync.
 */
type Layout = {
  items: ProgramItem[];
  withCards: boolean;
  /** Seconds each item renders for; a card grows by any crossfade into or out of it. */
  lengths: number[];
  /** Overlap of the join from item i-1 into item i (entry 0 unused). */
  overlaps: number[];
  fadeIns: (ItemFade | null)[];
  fadeOuts: (ItemFade | null)[];
};

/**
 * Lays out what to render. Without a program that's the playable ranges
 * with the usual 30ms joins -- the graph every project without cards or
 * transitions has always had.
 *
 * Transitions never change the program's length: a dip fades each side's
 * own edge and keeps the usual join, and a crossfade's overlap is added to
 * the card it blends with, so the footage around it keeps its timing.
 */
function layoutProgram(playableRanges: PlayableRange[], program?: RenderProgram): Layout {
  if (!program) assertValidRanges(playableRanges);
  const items: ProgramItem[] =
    program?.items ?? playableRanges.map((r) => ({ kind: "source", start: r.start, end: r.end }));
  const joins: Join[] = program?.joins ?? items.slice(1).map(() => ({ kind: "cut" }));
  if (program) {
    assertValidRanges(items.flatMap((item) => (item.kind === "source" ? [item] : [])));
    if (joins.length !== items.length - 1) throw new Error("Program joins don't match its items.");
    for (const item of items) {
      if (item.kind !== "card") continue;
      assertSeconds(item.card.duration, "card");
      if (!/^#[0-9a-fA-F]{6}$/.test(item.card.background)) throw new Error("Invalid card background color.");
    }
    for (const join of joins) {
      if (join.kind === "cut") continue;
      assertSeconds(join.seconds, "transition");
      if (join.kind === "dip") assertColor(join.color);
    }
    for (const fade of [program.fadeIn, program.fadeOut]) {
      if (!fade) continue;
      assertSeconds(fade.seconds, "fade");
      assertColor(fade.color);
    }
  }

  const logical = items.map((item) => (item.kind === "card" ? item.card.duration : item.end - item.start));
  const lengths = [...logical];
  const overlaps = logical.map(() => 0);
  const fadeIns: (ItemFade | null)[] = logical.map(() => null);
  const fadeOuts: (ItemFade | null)[] = logical.map(() => null);

  joins.forEach((join, j) => {
    const i = j + 1;
    const room = Math.min(logical[i - 1], logical[i]) / 2;
    if (join.kind === "crossfade") {
      const overlap = Math.min(join.seconds, room);
      overlaps[i] = overlap;
      // Grow the card side so the footage keeps its timing (the next card, if both are).
      if (items[i].kind === "card") lengths[i] += overlap;
      else lengths[i - 1] += overlap;
      return;
    }
    overlaps[i] = Math.min(CUT_CROSSFADE_SECONDS, room);
    if (join.kind === "dip") {
      const seconds = Math.min(join.seconds / 2, room);
      const fade = { color: join.color, seconds, audioSeconds: Math.min(seconds, DIP_AUDIO_MAX_SECONDS) };
      fadeOuts[i - 1] = fade;
      fadeIns[i] = fade;
    }
  });
  const edge = (fade: Fade | null, length: number): ItemFade | null => {
    if (!fade) return null;
    const seconds = Math.min(fade.seconds, length / 2);
    return { color: fade.color, seconds, audioSeconds: Math.min(seconds, EDGE_AUDIO_MAX_SECONDS) };
  };
  if (items.length > 0) {
    fadeIns[0] = edge(program?.fadeIn ?? null, logical[0]);
    const last = items.length - 1;
    fadeOuts[last] = edge(program?.fadeOut ?? null, logical[last]) ?? fadeOuts[last];
  }

  return {
    items,
    withCards: items.some((item) => item.kind === "card"),
    lengths,
    overlaps,
    fadeIns,
    fadeOuts,
  };
}

/** fade= filters for item i's edges, appended to its video chain. */
function videoFades(layout: Layout, i: number): string {
  const parts: string[] = [];
  const fadeIn = layout.fadeIns[i];
  const fadeOut = layout.fadeOuts[i];
  if (fadeIn) parts.push(`fade=t=in:st=0:d=${fadeIn.seconds.toFixed(3)}:color=${fadeIn.color}`);
  if (fadeOut) {
    const start = layout.lengths[i] - fadeOut.seconds;
    parts.push(`fade=t=out:st=${start.toFixed(3)}:d=${fadeOut.seconds.toFixed(3)}:color=${fadeOut.color}`);
  }
  return parts.map((p) => `,${p}`).join("");
}

/** afade= filters for item i's edges, appended to its audio chain. */
function audioFades(layout: Layout, i: number): string {
  const parts: string[] = [];
  const fadeIn = layout.fadeIns[i];
  const fadeOut = layout.fadeOuts[i];
  if (fadeIn) parts.push(`afade=t=in:st=0:d=${fadeIn.audioSeconds.toFixed(3)}`);
  if (fadeOut) {
    const start = layout.lengths[i] - fadeOut.audioSeconds;
    parts.push(`afade=t=out:st=${start.toFixed(3)}:d=${fadeOut.audioSeconds.toFixed(3)}`);
  }
  return parts.map((p) => `,${p}`).join("");
}

/**
 * Cards join the source through xfade/acrossfade, which need identical
 * frame size, rate, pixel format and timebase (video) and sample format,
 * rate and layout (audio) on both sides. A generated color source never
 * matches a decoded file on its own, so when cards are present every
 * segment is normalized to these. Without cards the graph is left exactly
 * as it always was.
 */
const CARD_AUDIO_FORMAT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
/**
 * The rate comes from fps= (sources) and the color source's own r= (cards),
 * which also gives both the same 1/rate timebase. Don't add settb here:
 * measured on ffmpeg 9, forcing another timebase after fps= brings back
 * the dropped-footage join the fps= fix exists for.
 */
const CARD_VIDEO_FORMAT = "format=yuv420p,setsar=1";

/**
 * atrim + acrossfade chains ending in [outa]: the edited program's audio,
 * before any cleanup. Cards contribute silence for their render length.
 * Join overlaps come from the layout, which also clamps each one to at most
 * half of either neighbour, so a short sliver between two nearby cuts
 * can't be eaten by a transition.
 */
function buildAudioEditChains(layout: Layout): string[] {
  const { items, lengths, overlaps } = layout;
  const normalize = layout.withCards ? `,${CARD_AUDIO_FORMAT}` : "";
  const chains = items.map((item, i) =>
    item.kind === "source"
      ? `[0:a]atrim=start=${item.start.toFixed(3)}:end=${item.end.toFixed(3)},asetpts=PTS-STARTPTS${normalize}${audioFades(layout, i)}[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${lengths[i].toFixed(3)}${normalize}${audioFades(layout, i)}[a${i}]`
  );
  if (items.length === 1) {
    chains.push("[a0]anull[outa]");
    return chains;
  }
  let label = "a0";
  for (let i = 1; i < items.length; i++) {
    const next = i === items.length - 1 ? "outa" : `ax${i}`;
    chains.push(`[${label}][a${i}]acrossfade=d=${overlaps[i].toFixed(3)}[${next}]`);
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
  /** With cards or transitions: the program, so the measured audio is what ships. */
  program?: RenderProgram;
  /** From audio-filters.ts#buildLoudnessAnalysisChain. */
  analysisChain: string;
}): string[] {
  const layout = layoutProgram(args.playableRanges, args.program);
  const chains = [...buildAudioEditChains(layout), `[outa]${args.analysisChain}[analysis]`];
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
  /** With cards or transitions: the program, so cards become silence and chapters stay in sync. */
  program?: RenderProgram;
  audioFilter?: string | null;
  format?: "m4a" | "mp3" | "wav";
  metadataPath?: string;
}): string[] {
  const layout = layoutProgram(args.playableRanges, args.program);
  const format = args.format ?? "m4a";
  const chains = buildAudioEditChains(layout);
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
 * Crop to the target aspect ratio (full height, sliding horizontally by
 * cropX, when the source is wider; full width, centered vertically, when it
 * is taller), then scale to the exact output size. Every value is a
 * validated number, and the expression quoting keeps its commas inside the
 * filter option.
 */
function buildReframeFilter({ width, height, cropX }: { width: number; height: number; cropX: number }): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new Error(`Invalid reframe size: ${width}x${height}`);
  }
  if (!Number.isFinite(cropX)) throw new Error("Invalid crop position.");
  const ratio = (width / height).toFixed(6);
  const x = Math.min(1, Math.max(0, cropX)).toFixed(4);
  const even = (expr: string) => `trunc((${expr})/2)*2`;
  return (
    `crop=w='${even(`if(gt(iw/ih,${ratio}),ih*${ratio},iw)`)}'` +
    `:h='${even(`if(gt(iw/ih,${ratio}),ih,iw/${ratio})`)}'` +
    `:x='(iw-ow)*${x}':y='(ih-oh)/2',scale=${width}:${height},setsar=1`
  );
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
  /**
   * Reframe to a different output size (clips: 9:16, 1:1...), cropping the
   * source to the target aspect first. cropX (0..1) picks the horizontal
   * position when the source is wider than the target. Applied before
   * captions and logo, so those are laid out on the reframed frame --
   * callers pass the output size as videoWidth/videoHeight.
   */
  reframe?: { width: number; height: number; cropX: number };
  /**
   * The source's frame rate as ffprobe reports it ("30000/1001", from
   * probe.ts#probeVideoStream). Every segment is pinned to it before the
   * xfade joins -- see the comment where it's applied.
   */
  frameRate: string;
  /**
   * The program with title cards (lib/timeline/program.ts), plus what the
   * card segments need to match the source: its frame size and the .ass
   * file with every card's text (lib/cards/ass.ts). Omit for a project
   * without cards.
   */
  program?: RenderProgram;
  cardFrame?: { width: number; height: number; textPath: string };
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
    reframe,
    frameRate,
    program,
    cardFrame,
  } = args;

  const layout = layoutProgram(playableRanges, program);
  const { items, lengths, overlaps, withCards } = layout;
  if (!/^\d{1,6}(\/\d{1,6})?$/.test(frameRate)) throw new Error(`Invalid frame rate: ${frameRate}`);
  if (withCards && !cardFrame) throw new Error("Title cards need the source's frame size.");
  if (cardFrame) assertValidCardFrame(cardFrame);

  const presetFilter = getFfmpegFilter(filterId);
  const propertiesFilter = properties ? buildPropertiesFilter(properties) : null;
  const colorFilter = [presetFilter, propertiesFilter].filter(Boolean).join(",");

  // fps= pins each trimmed segment to the source's frame rate. Without it,
  // xfade on ffmpeg 9 drops the start of every segment after a join: the
  // second input's frames before `offset` are consumed and discarded instead
  // of being held until the transition, so each cut silently lost footage
  // (measured on 9.0.2: a 2s + 10s join came out 10.0s long, the second
  // segment starting ~2s late). With an explicit rate on both inputs the
  // join lands where the offset says (11.98s, correct frames).
  //
  // tpad= then pads every segment but the last with a few cloned frames. A
  // segment is a whole number of frames, so it can end up to a frame short
  // of the length the offsets assume; when the stream built so far runs out
  // before its join's transition finishes, ffmpeg 9 ends the join there and
  // everything after it is lost (measured: a 5s + 10s + 2s chain came out
  // 14.9s, the last segment gone). xfade discards the first input's frames
  // after the transition, so the padding never reaches the output.
  const filterChains: string[] = [];
  items.forEach((item, i) => {
    const pad = i < items.length - 1 ? `,${SEGMENT_TAIL_PAD}` : "";
    const fades = videoFades(layout, i);
    if (!withCards) {
      const r = item as Extract<ProgramItem, { kind: "source" }>;
      filterChains.push(
        `[0:v]trim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},setpts=PTS-STARTPTS,fps=${frameRate}${fades}${pad}[v${i}]`
      );
      return;
    }
    // With cards, color grading is applied per source segment so the cards
    // keep their exact chosen color (a black-and-white preset shouldn't
    // turn a blue card grey).
    if (item.kind === "source") {
      const grade = colorFilter ? `,${colorFilter}` : "";
      filterChains.push(
        `[0:v]trim=start=${item.start.toFixed(3)}:end=${item.end.toFixed(3)},setpts=PTS-STARTPTS${grade},fps=${frameRate},${CARD_VIDEO_FORMAT}${fades}${pad}[v${i}]`
      );
    } else {
      const color = item.card.background.slice(1).toUpperCase();
      filterChains.push(
        `color=c=0x${color}:s=${cardFrame!.width}x${cardFrame!.height}:r=${frameRate}:d=${lengths[i].toFixed(3)},${CARD_VIDEO_FORMAT}${fades}${pad}[v${i}]`
      );
    }
  });

  if (items.length === 1) {
    filterChains.push(`[v0]null[outv]`);
  } else {
    // Chain xfade pairwise across every cut instead of a plain concat.
    // xfade's offset is where the transition starts inside the
    // *combined-so-far* stream, so it has to be tracked cumulatively as
    // each pair is joined (this is the standard idiom for chaining more
    // than one xfade) -- verified against a real ffmpeg render, not just
    // the filter's documented options, since offset math like this is easy
    // to get subtly wrong. The audio side uses the same overlaps (see
    // buildAudioEditChains), both from layoutProgram.
    let videoLabel = "v0";
    let cumulativeDuration = lengths[0];
    for (let i = 1; i < items.length; i++) {
      const segmentDuration = lengths[i];
      const crossfade = overlaps[i];
      const offset = (cumulativeDuration - crossfade).toFixed(3);
      const nextVideoLabel = i === items.length - 1 ? "outv" : `vx${i}`;
      filterChains.push(
        `[${videoLabel}][v${i}]xfade=transition=fade:duration=${crossfade.toFixed(3)}:offset=${offset}[${nextVideoLabel}]`
      );
      videoLabel = nextVideoLabel;
      cumulativeDuration = cumulativeDuration + segmentDuration - crossfade;
    }
  }

  filterChains.push(...buildAudioEditChains(layout));
  let audioOutLabel = "[outa]";
  if (audioFilter) {
    filterChains.push(`[outa]${audioFilter}[cleana]`);
    audioOutLabel = "[cleana]";
  }

  let videoOutLabel = "[outv]";
  if (colorFilter && !withCards) {
    filterChains.push(`[outv]${colorFilter}[filtered]`);
    videoOutLabel = "[filtered]";
  }

  if (reframe) {
    filterChains.push(`${videoOutLabel}${buildReframeFilter(reframe)}[reframed]`);
    videoOutLabel = "[reframed]";
  }

  // Card text sits above the footage and below captions and the logo.
  if (withCards) {
    filterChains.push(`${videoOutLabel}subtitles=filename='${escapeSubtitlesPath(cardFrame!.textPath)}'[carded]`);
    videoOutLabel = "[carded]";
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
