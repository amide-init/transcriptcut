import type { EditedSentence } from "@/lib/publishing/edited-transcript";

/** A scene the model picked: the sentence it opens with, and a name. */
export type ScenePick = { sentenceIndex: number; title: string };

/**
 * A suggested scene boundary, for the user to review -- never applied on
 * its own. `at` is source time: 0 for the first scene (only naming it), else
 * a point between words, on a shot change when one was close.
 */
export type SceneSuggestion = {
  at: number;
  title: string;
  /** The opening sentence, so the review list can show what the scene starts with. */
  excerpt: string;
  /** True when `at` was moved onto a detected shot change. */
  onShot: boolean;
};

export const SCENE_TITLE_MAX = 60;
const MAX_SCENES = 30;
/** A boundary moves onto a shot change at most this far away. */
const SHOT_SNAP_SECONDS = 1.5;
const EXCERPT_MAX = 90;

/** Fewest seconds between suggested scenes: 45s, less for a short video so it can still be split. */
export function minSceneSeconds(totalSeconds: number): number {
  return Math.min(45, Math.max(10, totalSeconds / 6));
}

export function cleanSceneTitle(title: string): string {
  // Titles also become card text: no control characters, braces or backslashes (see validation/edit-operation.ts).
  const cleaned = Array.from(title)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && !"{}\\".includes(ch);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > SCENE_TITLE_MAX ? `${cleaned.slice(0, SCENE_TITLE_MAX - 1).trimEnd()}…` : cleaned;
}

function excerpt(text: string): string {
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
}

/** Midpoint of the silence before a source time (after the last word ending at or before it). */
function gapBefore(sourceTime: number, words: { start: number; end: number }[]): number {
  let previousEnd = 0;
  for (const w of words) {
    if (w.end <= sourceTime && w.end > previousEnd) previousEnd = w.end;
  }
  return (previousEnd + sourceTime) / 2;
}

/** The shot change nearest `t` within SHOT_SNAP_SECONDS that isn't in the middle of a word. */
function nearbyShot(t: number, shots: number[], words: { start: number; end: number }[]): number | null {
  let best: number | null = null;
  for (const shot of shots) {
    const distance = Math.abs(shot - t);
    if (distance > SHOT_SNAP_SECONDS) continue;
    if (words.some((w) => shot > w.start && shot < w.end)) continue;
    if (best === null || distance < Math.abs(best - t)) best = shot;
  }
  return best;
}

/**
 * Turns picks (from the model or from chapters) into scene suggestions:
 * indices checked, titles cleaned, the first scene always starting at 0
 * (a first pick near the start names it; otherwise it's called "Intro"),
 * scenes at least `minGapSeconds` apart on the edited timeline (the rest
 * dropped), and each boundary placed in the silence before its sentence --
 * or on a shot change within 1.5s, so the cut is also a visual one.
 */
export function scenesFromPicks(
  picks: ScenePick[],
  sentences: EditedSentence[],
  words: { start: number; end: number }[],
  shots: number[],
  minGapSeconds: number
): SceneSuggestion[] {
  if (sentences.length === 0) return [];
  const valid = picks
    .filter((p) => Number.isInteger(p.sentenceIndex) && p.sentenceIndex >= 0 && p.sentenceIndex < sentences.length)
    .map((p) => ({ index: p.sentenceIndex, title: cleanSceneTitle(p.title) }))
    .filter((p) => p.title.length > 0)
    .sort((a, b) => a.index - b.index);
  if (valid.length === 0) return [];
  // A first pick close to the start names the opening scene rather than being
  // dropped as too close to it (models often skip the greeting sentence).
  if (valid[0].index !== 0) {
    if (sentences[valid[0].index].start < minGapSeconds) valid[0] = { ...valid[0], index: 0 };
    else valid.unshift({ index: 0, title: "Intro" });
  }

  const suggestions: SceneSuggestion[] = [];
  let lastStart = -Infinity;
  for (const pick of valid) {
    const sentence = sentences[pick.index];
    if (pick.index > 0 && sentence.start - lastStart < minGapSeconds) continue;
    if (pick.index === 0) {
      suggestions.push({ at: 0, title: pick.title, excerpt: excerpt(sentence.text), onShot: false });
    } else {
      const gap = gapBefore(sentence.sourceStart, words);
      const shot = nearbyShot(gap, shots, words);
      suggestions.push({ at: shot ?? gap, title: pick.title, excerpt: excerpt(sentence.text), onShot: shot !== null });
    }
    lastStart = pick.index === 0 ? 0 : sentence.start;
    if (suggestions.length >= MAX_SCENES) break;
  }
  return suggestions;
}
