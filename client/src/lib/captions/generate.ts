import type { Transcript } from "@/types/transcript";
import type { CutOperation } from "@/types/edit-operation";
import { splitIntoSentences } from "@/lib/timeline/sentences";
import { computePlayableRanges, isWordCut, sourceTimeToEditedTime } from "@/lib/timeline/cuts";

export type CaptionCue = {
  /** Seconds, on the *edited* timeline (post-cuts) -- matches the rendered video, not the raw source. */
  start: number;
  end: number;
  text: string;
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
      });
    }
  }

  return cues.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
}
