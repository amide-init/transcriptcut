import type { SilenceSpan } from "@/lib/ffmpeg/audio";
import type { Transcript, TranscriptSegment } from "@/types/transcript";

/**
 * Splitting long audio for Whisper, whose API rejects uploads over 25MB.
 * Pure functions only -- the ffmpeg/OpenAI side lives in
 * lib/ai/transcription-job.ts -- so the boundary and offset logic is
 * unit-testable (claude.md section 25).
 */

export type AudioChunk = { index: number; start: number; end: number };

export type ChunkPlanOptions = {
  /** Preferred chunk length in seconds. */
  targetSeconds: number;
  /** How far from the target a silence may be and still be used as the boundary. */
  searchWindowSeconds: number;
};

/**
 * Ten minutes at the extracted 32kbps is ~2.4MB, far under Whisper's cap;
 * the length is chosen for progress granularity and retry cost, not size.
 */
export const DEFAULT_CHUNK_PLAN: ChunkPlanOptions = { targetSeconds: 600, searchWindowSeconds: 90 };

/**
 * Splits [0, duration] into ~targetSeconds chunks, placing each boundary in
 * the middle of the silence nearest the target, so no word is cut in half
 * and transcribed twice or not at all. Falls back to a hard cut at the
 * target when there's no silence within the search window.
 */
export function planChunks(
  duration: number,
  silences: SilenceSpan[],
  options: ChunkPlanOptions = DEFAULT_CHUNK_PLAN
): AudioChunk[] {
  const { targetSeconds, searchWindowSeconds } = options;
  if (duration <= 0) return [];

  const chunks: AudioChunk[] = [];
  let cursor = 0;
  // A trailing sliver shorter than this is folded into the last chunk instead.
  const minTail = targetSeconds / 4;

  while (duration - cursor > targetSeconds + minTail) {
    const ideal = cursor + targetSeconds;
    let boundary = ideal;
    let bestDistance = Infinity;
    for (const silence of silences) {
      const mid = (silence.start + silence.end) / 2;
      const distance = Math.abs(mid - ideal);
      const leavesRealChunk = mid - cursor >= minTail && duration - mid >= minTail;
      if (distance <= searchWindowSeconds && distance < bestDistance && leavesRealChunk) {
        bestDistance = distance;
        boundary = mid;
      }
    }
    chunks.push({ index: chunks.length, start: cursor, end: boundary });
    cursor = boundary;
  }

  chunks.push({ index: chunks.length, start: cursor, end: duration });
  return chunks;
}

/**
 * Whisper sometimes repeats a clip's last sentence into trailing silence,
 * with every repeated word collapsed to (near) zero duration -- and chunking
 * gives it one clip end per chunk to do this at. Only a segment that both
 * repeats the previous one's text *and* is mostly zero-length words is
 * dropped, so a genuinely repeated phrase ("yeah. yeah.") with real timing
 * survives.
 */
export function isDegenerateRepeat(previous: TranscriptSegment | undefined, segment: TranscriptSegment): boolean {
  if (!previous || segment.words.length === 0) return false;
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (normalize(previous.text) !== normalize(segment.text)) return false;
  const zeroLength = segment.words.filter((w) => w.end - w.start < 0.02).length;
  return zeroLength / segment.words.length >= 0.6;
}

/**
 * Stitches per-chunk transcripts (each timed from 0 within its own chunk)
 * into one transcript on the source timeline: shifts every timestamp by its
 * chunk's start, and re-numbers segment/word ids so they stay unique across
 * chunks. Drops Whisper's end-of-clip repeats (see isDegenerateRepeat).
 * Input order doesn't matter; output is ordered by time.
 */
export function mergeChunkTranscripts(parts: { offset: number; transcript: Transcript }[]): Transcript {
  const ordered = [...parts].sort((a, b) => a.offset - b.offset);
  const segments: TranscriptSegment[] = [];
  let wordCounter = 0;

  for (const { offset, transcript } of ordered) {
    for (const segment of transcript.segments) {
      if (isDegenerateRepeat(segments[segments.length - 1], segment)) continue;
      segments.push({
        ...segment,
        id: `segment-${segments.length}`,
        start: segment.start + offset,
        end: segment.end + offset,
        words: segment.words.map((word) => ({
          ...word,
          id: `word-${wordCounter++}`,
          start: word.start + offset,
          end: word.end + offset,
        })),
      });
    }
  }

  return { id: crypto.randomUUID(), segments };
}
