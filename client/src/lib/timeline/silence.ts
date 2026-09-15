import type { Transcript } from "@/types/transcript";

export type SilenceGap = {
  start: number;
  end: number;
};

export const DEFAULT_SILENCE_THRESHOLD = 1.5;

/**
 * Finds gaps between consecutive transcript words (across segment
 * boundaries too) longer than the threshold, per claude.md section 27 #4.
 * Purely algorithmic — no LLM involved, unlike filler-word detection.
 * Designed to become the removeSilence() agent tool from section 7: pure
 * and side-effect-free, so it works the same whether called from the UI
 * (as it is now) or later from a server-side agent.
 */
export function detectSilences(
  transcript: Transcript,
  thresholdSeconds: number = DEFAULT_SILENCE_THRESHOLD
): SilenceGap[] {
  const words = transcript.segments.flatMap((s) => s.words);
  const gaps: SilenceGap[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    const start = words[i].end;
    const end = words[i + 1].start;
    if (end - start >= thresholdSeconds) {
      gaps.push({ start, end });
    }
  }

  return gaps;
}
