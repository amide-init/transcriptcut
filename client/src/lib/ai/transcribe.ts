import OpenAI from "openai";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types/transcript";

// Constructed lazily, not at module scope: the OpenAI client throws
// immediately if OPENAI_API_KEY is unset, and this module gets evaluated
// during `next build`'s page-data collection for the API route that
// imports it -- eagerly constructing it here made every build fail
// without a real key configured (confirmed: every CI run failed on this
// exact error, since CI intentionally has no secrets). Deferred to first
// actual call instead, where a real key is only needed because the
// request can't do anything useful without one anyway.
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

type WhisperWord = { word: string; start: number; end: number };
type WhisperSegment = { id: number; start: number; end: number; text: string };
type WhisperVerboseResponse = {
  words?: WhisperWord[];
  segments?: WhisperSegment[];
};

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
    ? rawSegments.map((seg, i) => ({
        id: `segment-${i}`,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        words: words.filter((w) => w.start >= seg.start && w.end <= seg.end + 0.05),
      }))
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
