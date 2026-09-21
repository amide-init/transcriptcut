import type { CutOperation } from "@/types/edit-operation";
import type { PlayableRange } from "@/types/timeline";
import type { TranscriptWord } from "@/types/transcript";

/**
 * [start, end] spanning every word in the list -- first word's start, last
 * word's end -- falling back to `fallback` if the list is empty. Use this
 * (not a container's own reported start/end, e.g. a Whisper
 * TranscriptSegment's `start`/`end`) whenever a cut needs to span "all of
 * these words": a container's own boundary can be looser than its actual
 * words (e.g. transcribe.ts tolerates a word ending up to 50ms past its
 * segment's `end`), so cutting the container's boundary directly can leave
 * a sliver of the last word's footage surviving past the cut -- visible as
 * a brief flash in both the preview and the export, since both read the
 * same stored cut boundary.
 */
export function wordSpanBounds(
  words: { start: number; end: number }[],
  fallback: { start: number; end: number }
): { start: number; end: number } {
  if (words.length === 0) return fallback;
  return { start: words[0].start, end: words[words.length - 1].end };
}

/** Merge overlapping/adjacent cut ranges and sort by start time. */
function mergeCuts(cuts: CutOperation[]): { start: number; end: number }[] {
  const sorted = [...cuts]
    .map((c) => ({ start: c.start, end: c.end }))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const cut of sorted) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) {
      last.end = Math.max(last.end, cut.end);
    } else {
      merged.push({ ...cut });
    }
  }
  return merged;
}

/** Subtract merged cut ranges from [0, duration] to get the surviving playable ranges. */
export function computePlayableRanges(
  duration: number,
  cuts: CutOperation[]
): PlayableRange[] {
  if (duration <= 0) return [];
  const merged = mergeCuts(cuts);

  const ranges: PlayableRange[] = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.start > cursor) {
      ranges.push({ start: cursor, end: Math.min(cut.start, duration) });
    }
    cursor = Math.max(cursor, cut.end);
    if (cursor >= duration) break;
  }
  if (cursor < duration) {
    ranges.push({ start: cursor, end: duration });
  }
  return ranges.filter((r) => r.end > r.start);
}

export function getEditedDuration(ranges: PlayableRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

/** Is this source-time instant inside a cut (i.e. not in any playable range)? */
export function isCut(sourceTime: number, ranges: PlayableRange[]): boolean {
  return !ranges.some((r) => sourceTime >= r.start && sourceTime < r.end);
}

/** Is this [start, end) word/sentence/segment range entirely covered by a cut? */
export function isWordCut(start: number, end: number, cuts: CutOperation[]): boolean {
  return cuts.some((c) => start >= c.start && end <= c.end + 0.001);
}

/** Are every one of these words individually cut (e.g. a whole sentence/segment)? */
export function isFullyCut(words: TranscriptWord[], cuts: CutOperation[]): boolean {
  return words.length > 0 && words.every((w) => isWordCut(w.start, w.end, cuts));
}

/**
 * If sourceTime falls inside a cut, return the start of the next playable
 * range (so playback can jump forward over it). Returns null if sourceTime
 * is at/after the end of the last playable range (end of edited video).
 */
export function nextPlayableTime(
  sourceTime: number,
  ranges: PlayableRange[]
): number | null {
  for (const r of ranges) {
    if (sourceTime >= r.start && sourceTime < r.end) return sourceTime;
    if (sourceTime < r.start) return r.start;
  }
  return null;
}

/** Map a source-video timestamp to its position on the edited (cuts-removed) timeline. */
export function sourceTimeToEditedTime(
  sourceTime: number,
  ranges: PlayableRange[]
): number {
  let elapsed = 0;
  for (const r of ranges) {
    if (sourceTime < r.start) return elapsed;
    if (sourceTime <= r.end) return elapsed + (sourceTime - r.start);
    elapsed += r.end - r.start;
  }
  return elapsed;
}

/** Map a position on the edited timeline back to the corresponding source-video timestamp. */
export function editedTimeToSourceTime(
  editedTime: number,
  ranges: PlayableRange[]
): number {
  let elapsed = 0;
  for (const r of ranges) {
    const len = r.end - r.start;
    if (editedTime <= elapsed + len) {
      return r.start + (editedTime - elapsed);
    }
    elapsed += len;
  }
  const last = ranges[ranges.length - 1];
  return last ? last.end : 0;
}
