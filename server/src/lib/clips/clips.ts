import type { EditedSentence } from "@/lib/publishing/edited-transcript";
import type { CutOperation } from "@/types/edit-operation";
import {
  HIGHLIGHT_MAX_SECONDS,
  HIGHLIGHT_MIN_SECONDS,
  MAX_HIGHLIGHTS,
  type Clip,
} from "@/types/clips";

/**
 * Clip rules. Pure functions only, so they're unit-testable (claude.md
 * section 25).
 */

/**
 * A clip as extra cuts: everything before and after it. Added to the
 * project's own cuts, this makes the existing render, caption and loudness
 * pipeline produce just the clip -- with the project's edits (removed
 * filler words, pauses...) still applied inside it.
 */
export function clipAsCuts(clip: Pick<Clip, "sourceStart" | "sourceEnd">, duration: number): CutOperation[] {
  const cuts: CutOperation[] = [];
  if (clip.sourceStart > 0) {
    cuts.push({ id: "clip-before", type: "cut", start: 0, end: clip.sourceStart, createdAt: 0 });
  }
  if (clip.sourceEnd < duration) {
    cuts.push({ id: "clip-after", type: "cut", start: clip.sourceEnd, end: duration, createdAt: 0 });
  }
  return cuts;
}

/** Breathing room around the words, so a clip doesn't start or end mid-syllable. */
const LEAD_IN_SECONDS = 0.1;
const TAIL_SECONDS = 0.3;

export type HighlightPick = { startSentence: number; endSentence: number; title: string; reason: string };

function cleanText(text: string, max: number): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Turns the model's picks (sentence index ranges) into clips. Bounds come
 * from the sentences' own word timings -- never from a time the model wrote
 * -- so a clip always starts and ends on whole sentences. Picks with bad
 * indices are dropped; a pick longer than the maximum is shortened a
 * sentence at a time from the end; one still shorter than the minimum is
 * dropped; overlaps with an earlier pick are dropped.
 */
export function highlightsFromPicks(
  picks: HighlightPick[],
  sentences: EditedSentence[],
  duration: number
): Omit<Clip, "id">[] {
  const clips: Omit<Clip, "id">[] = [];
  const taken: { start: number; end: number }[] = [];

  for (const pick of picks) {
    const { startSentence: first } = pick;
    let last = pick.endSentence;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= sentences.length || last < first) {
      continue;
    }
    while (last > first && sentences[last].end - sentences[first].start > HIGHLIGHT_MAX_SECONDS) last--;
    const length = sentences[last].end - sentences[first].start;
    if (length < HIGHLIGHT_MIN_SECONDS || length > HIGHLIGHT_MAX_SECONDS) continue;

    const start = sentences[first].start;
    const end = sentences[last].end;
    if (taken.some((t) => start < t.end && end > t.start)) continue;
    taken.push({ start, end });

    const title = cleanText(pick.title, 80);
    clips.push({
      name: title || `Highlight ${clips.length + 1}`,
      sourceStart: Math.max(0, sentences[first].sourceStart - LEAD_IN_SECONDS),
      sourceEnd: Math.min(duration, sentences[last].sourceEnd + TAIL_SECONDS),
      aspect: "9:16",
      cropX: 0.5,
      captions: true,
      source: "ai",
      reason: cleanText(pick.reason, 300) || null,
    });
    if (clips.length >= MAX_HIGHLIGHTS) break;
  }
  return clips.sort((a, b) => a.sourceStart - b.sourceStart);
}
