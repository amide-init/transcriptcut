import type { Transcript } from "@/types/transcript";
import type { CutOperation } from "@/types/edit-operation";
import { splitIntoSentences } from "@/lib/timeline/sentences";
import { computePlayableRanges, isWordCut, sourceTimeToEditedTime } from "@/lib/timeline/cuts";

export type CaptionCueWord = {
  /** Seconds, on the *edited* timeline (post-cuts). */
  start: number;
  end: number;
  text: string;
};

export type CaptionCue = {
  /** Seconds, on the *edited* timeline (post-cuts) -- matches the rendered video, not the raw source. */
  start: number;
  end: number;
  text: string;
  /** Per-word timing within this cue, for word-by-word highlight styles (claude.md issue #15). */
  words: CaptionCueWord[];
};

/**
 * Generates one caption cue per sentence, from word-level transcript
 * timestamps. Must respect edit operations (claude.md section 10, issue
 * requirement): a sentence entirely inside a cut is dropped, a partially
 * cut sentence keeps only its surviving words, and every timestamp is
 * remapped from source time to edited-timeline time via the same
 * computePlayableRanges/sourceTimeToEditedTime the preview and the render
 * pipeline use -- captions must land on the rendered video's actual
 * timeline, not the pre-cut source video's.
 */
export function generateCaptions(
  transcript: Transcript,
  cuts: CutOperation[],
  duration: number
): CaptionCue[] {
  const playableRanges = computePlayableRanges(duration, cuts);
  const cues: CaptionCue[] = [];

  for (const segment of transcript.segments) {
    for (const sentence of splitIntoSentences(segment)) {
      const survivingWords = sentence.words.filter((w) => !isWordCut(w.start, w.end, cuts));
      if (survivingWords.length === 0) continue;

      const sourceStart = survivingWords[0].start;
      const sourceEnd = survivingWords[survivingWords.length - 1].end;

      cues.push({
        start: sourceTimeToEditedTime(sourceStart, playableRanges),
        end: sourceTimeToEditedTime(sourceEnd, playableRanges),
        text: survivingWords.map((w) => w.text).join(" "),
        words: survivingWords.map((w) => ({
          start: sourceTimeToEditedTime(w.start, playableRanges),
          end: sourceTimeToEditedTime(w.end, playableRanges),
          text: w.text,
        })),
      });
    }
  }

  return cues.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
}

/**
 * Re-cuts sentence-long cues into a few words each -- the fast, punchy
 * captions Shorts/Reels use. On a narrow vertical frame at Shorts font
 * sizes, a full sentence wraps into a wall of text. Word timings are kept,
 * so word-highlight still lines up.
 */
export function splitCuesForShorts(cues: CaptionCue[], maxWords = 4): CaptionCue[] {
  return cues.flatMap((cue) => {
    if (cue.words.length <= maxWords) return [cue];
    // Even out group sizes (7 words -> 4+3, not 4+3... or 6+1).
    const groups = Math.ceil(cue.words.length / maxWords);
    const size = Math.ceil(cue.words.length / groups);
    const parts: CaptionCue[] = [];
    for (let i = 0; i < cue.words.length; i += size) {
      const words = cue.words.slice(i, i + size);
      const next = cue.words[i + size];
      parts.push({
        start: words[0].start,
        // Hold each part until the next one starts, so captions don't flicker off between words.
        end: next ? next.start : cue.end,
        text: words.map((w) => w.text).join(" "),
        words,
      });
    }
    return parts;
  });
}
