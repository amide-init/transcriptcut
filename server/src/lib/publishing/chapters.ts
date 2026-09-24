import { nextPlayableTime, sourceTimeToEditedTime } from "@/lib/timeline/cuts";
import { formatTimestamp, type EditedSentence } from "@/lib/publishing/edited-transcript";
import {
  CHAPTER_TITLE_MAX,
  MAX_CHAPTERS,
  MIN_CHAPTER_SECONDS,
  type Chapter,
  type ResolvedChapter,
} from "@/types/publishing";
import type { PlayableRange } from "@/types/timeline";

/**
 * Chapter rules shared by AI output and user edits. Pure functions only, so
 * they're unit-testable (claude.md section 25).
 */

export function cleanChapterTitle(title: string): string {
  // Chapter titles end up in ffmpeg metadata and ID3 frames: no control characters or newlines.
  return title
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAPTER_TITLE_MAX);
}

/**
 * Shortest chapter worth having for an episode this long: roughly a tenth
 * of the episode, between MIN_CHAPTER_SECONDS and 3 minutes. Keeps AI
 * chapters from bunching up (measured: on a transcript that mentions a new
 * topic every 20s, unconstrained picks put three chapters in the first 27s
 * of an 18-minute episode).
 */
export function minChapterSeconds(totalSeconds: number): number {
  return Math.round(Math.min(180, Math.max(MIN_CHAPTER_SECONDS, totalSeconds / 10)));
}

/**
 * Turns the model's picks ({sentenceIndex, title}) into chapters. Starts come
 * from the sentences themselves, never from a timestamp the model wrote, so a
 * chapter always lands exactly on the start of a real sentence. Invalid
 * indices are dropped, the first chapter is forced to the start, and
 * chapters closer than `minGapSeconds` apart on the edited timeline are
 * merged into the earlier one.
 */
export function chaptersFromPicks(
  picks: { sentenceIndex: number; title: string }[],
  sentences: EditedSentence[],
  minGapSeconds: number = MIN_CHAPTER_SECONDS
): Chapter[] {
  if (sentences.length === 0) return [];
  const valid = picks
    .filter((p) => Number.isInteger(p.sentenceIndex) && p.sentenceIndex >= 0 && p.sentenceIndex < sentences.length)
    .map((p) => ({ index: p.sentenceIndex, title: cleanChapterTitle(p.title) }))
    .filter((p) => p.title.length > 0)
    .sort((a, b) => a.index - b.index);

  if (valid.length === 0 || valid[0].index !== 0) {
    valid.unshift({ index: 0, title: valid[0]?.index === 0 ? valid[0].title : "Intro" });
  }

  const chapters: Chapter[] = [];
  let lastStart = -Infinity;
  for (const pick of valid) {
    const sentence = sentences[pick.index];
    if (sentence.start - lastStart < minGapSeconds) continue;
    chapters.push({ id: `chapter-${chapters.length}`, title: pick.title, sourceStart: sentence.sourceStart });
    lastStart = sentence.start;
    if (chapters.length >= MAX_CHAPTERS) break;
  }
  return chapters;
}

/**
 * Places stored (source-time) chapters on the edited timeline. A chapter
 * whose moment was cut moves to the next surviving moment; one past the end
 * of the program is dropped; the first always starts at 0; and any that end
 * up closer than MIN_CHAPTER_SECONDS to the previous are dropped.
 */
export function resolveChapters(chapters: Chapter[], ranges: PlayableRange[]): ResolvedChapter[] {
  const placed = chapters
    .map((c) => {
      const playable = nextPlayableTime(c.sourceStart, ranges);
      return playable === null ? null : { ...c, start: sourceTimeToEditedTime(playable, ranges) };
    })
    .filter((c): c is ResolvedChapter => c !== null)
    .sort((a, b) => a.start - b.start);

  const resolved: ResolvedChapter[] = [];
  for (const c of placed) {
    const start = resolved.length === 0 ? 0 : c.start;
    const previous = resolved[resolved.length - 1];
    if (previous && start - previous.start < MIN_CHAPTER_SECONDS) continue;
    resolved.push({ ...c, start });
  }
  return resolved;
}

/** "00:00 Intro" lines for a YouTube description or show notes. */
export function toYoutubeChapters(chapters: ResolvedChapter[], totalSeconds: number): string {
  const longForm = totalSeconds >= 3600;
  return chapters.map((c) => `${formatTimestamp(c.start, longForm)} ${c.title}`).join("\n");
}

/** Escapes a value for ffmpeg's FFMETADATA format: '=', ';', '#', '\' and newlines. */
function escapeFfmetadata(value: string): string {
  return value.replace(/[\\=;#\n]/g, (ch) => `\\${ch}`);
}

/**
 * An FFMETADATA1 file carrying the episode title and chapter markers, fed
 * to ffmpeg as an extra input (-map_metadata/-map_chapters) so the exported
 * MP4/MP3 has real chapters that podcast apps and players show.
 */
export function toFfmetadata(chapters: ResolvedChapter[], totalSeconds: number, title: string): string {
  const lines = [";FFMETADATA1", `title=${escapeFfmetadata(cleanChapterTitle(title))}`];
  const totalMs = Math.round(totalSeconds * 1000);
  chapters.forEach((c, i) => {
    const start = Math.round(c.start * 1000);
    const end = i + 1 < chapters.length ? Math.round(chapters[i + 1].start * 1000) : totalMs;
    if (end <= start) return;
    lines.push("", "[CHAPTER]", "TIMEBASE=1/1000", `START=${start}`, `END=${end}`, `title=${escapeFfmetadata(c.title)}`);
  });
  return lines.join("\n") + "\n";
}
