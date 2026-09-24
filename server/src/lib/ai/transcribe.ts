import OpenAI from "openai";
import { getOpenAiApiKey } from "@/lib/settings";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types/transcript";

// Constructed fresh per call, not cached: the key can come from
// settings.json (set via the app's setup screen) and change at runtime
// without a server restart -- a cached client would keep using a stale
// (possibly missing) key after someone saves a new one.
function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey() });
}

type WhisperWord = { word: string; start: number; end: number };
type WhisperSegment = { id: number; start: number; end: number; text: string };
type WhisperVerboseResponse = {
  words?: WhisperWord[];
  segments?: WhisperSegment[];
};

/**
 * Puts every Whisper word into exactly one segment: the one its time range
 * overlaps most, or, for a word that falls in a gap between segments, the
 * nearest one. Word and segment timestamps come from separate passes and
 * routinely disagree by a fraction of a second at segment edges -- measured:
 * "Thanks" at 6.40-6.70s, its segment starting at 6.68s. The previous rule
 * (word must fit entirely inside a segment) put such words in no segment at
 * all, silently dropping ~1% of words from a conversational transcript and
 * shifting sentence boundaries in every affected segment.
 *
 * Assignments never go backwards, so word order is preserved, and each
 * segment's bounds grow to cover its words.
 */
export function groupWordsIntoSegments(
  words: TranscriptWord[],
  rawSegments: { start: number; end: number; text: string }[]
): TranscriptSegment[] {
  const buckets: TranscriptWord[][] = rawSegments.map(() => []);
  let floor = 0;
  for (const word of words) {
    let best = floor;
    let bestScore = -Infinity;
    for (let i = floor; i < rawSegments.length; i++) {
      const seg = rawSegments[i];
      // Positive = seconds of overlap; negative = distance to the segment.
      const score = Math.min(word.end, seg.end) - Math.max(word.start, seg.start);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
      if (seg.start > word.end && score < bestScore) break;
    }
    buckets[best].push(word);
    floor = best;
  }

  return rawSegments.map((seg, i) => {
    const segWords = buckets[i];
    return {
      id: `segment-${i}`,
      start: segWords.length ? Math.min(seg.start, segWords[0].start) : seg.start,
      end: segWords.length ? Math.max(seg.end, segWords[segWords.length - 1].end) : seg.end,
      text: seg.text.trim(),
      words: segWords,
    };
  });
}

/**
 * Transcribes a video/audio file with word-level timestamps via OpenAI Whisper,
 * and groups the words into sentence-like segments.
 */
export async function transcribeFile(file: File): Promise<Transcript> {
  const response = (await getOpenAI().audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  })) as unknown as WhisperVerboseResponse;

  const words: TranscriptWord[] = (response.words ?? []).map((w, i) => ({
    id: `word-${i}`,
    text: w.word,
    start: w.start,
    end: w.end,
  }));

  const rawSegments = response.segments ?? [];
  const segments: TranscriptSegment[] = rawSegments.length
    ? groupWordsIntoSegments(words, rawSegments)
    : words.length
      ? [
          {
            id: "segment-0",
            start: words[0].start,
            end: words[words.length - 1].end,
            text: words.map((w) => w.text).join(" ").trim(),
            words,
          },
        ]
      : [];

  return {
    id: crypto.randomUUID(),
    segments,
  };
}
