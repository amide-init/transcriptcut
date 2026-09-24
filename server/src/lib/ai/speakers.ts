import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types/transcript";

/**
 * Speaker detection glue: merging per-chunk diarization results and laying
 * speaker labels onto the Whisper transcript. Pure functions only -- the
 * API calls live in lib/ai/diarize.ts and lib/ai/diarization-job.ts -- so
 * the alignment rules are unit-testable (claude.md section 25).
 *
 * Diarization (gpt-4o-transcribe-diarize) returns speaker-labeled spans but
 * no word timings, while Whisper has exact word timings but no speakers.
 * Whisper stays the source of truth for words and timing; diarization only
 * decides who said each word.
 */

/** A diarized span on the source timeline. `speaker` is a stable key across chunks. */
export type SpeakerSpan = { speaker: string; start: number; end: number };

/** One chunk's diarization, with offsets onto the source timeline. */
export type DiarizedChunk = {
  chunkIndex: number;
  /** Source time where this chunk's audio slice starts. */
  offset: number;
  /**
   * Source time where this chunk's own territory starts. Everything before
   * it re-covers the end of the previous chunk: used only to match labels,
   * then discarded in favor of the previous chunk's spans.
   */
  ownFrom: number;
  spans: SpeakerSpan[];
};

/** A label matches an earlier speaker if they share at least this much of the overlap... */
const MIN_MATCH_SECONDS = 1;
/** ...and this fraction of the label's own speech in the overlap. */
const MIN_MATCH_FRACTION = 0.5;

function clip(span: SpeakerSpan, from: number, to: number): SpeakerSpan | null {
  const start = Math.max(span.start, from);
  const end = Math.min(span.end, to);
  return end > start ? { ...span, start, end } : null;
}

/**
 * Stitches per-chunk diarization into one timeline with speaker keys that
 * are consistent across chunks. Diarization labels are only consistent
 * within one API call, so two things line them up:
 *
 * - Known speakers: later chunks are sent with reference clips of the first
 *   chunk's speakers (known_speaker_names), and labels matching those names
 *   are kept as-is.
 * - Overlap matching: each later chunk re-covers the end of the previous
 *   one, and any other label is mapped to the speaker it co-occurs with most
 *   in that shared stretch. References alone weren't enough -- measured: when
 *   the first chunk merged two similar voices, the reference clip picked for
 *   that label was the wrong voice, and a main speaker came back as "new"
 *   for the rest of the episode.
 *
 * A label matching nobody is a genuinely new voice, namespaced to its chunk.
 */
export function mergeDiarizedChunks(chunks: DiarizedChunk[], knownSpeakers: string[]): SpeakerSpan[] {
  const known = new Set(knownSpeakers);
  const merged: SpeakerSpan[] = [];

  for (const chunk of [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)) {
    const spans = chunk.spans
      .map((s) => ({ ...s, start: s.start + chunk.offset, end: s.end + chunk.offset }))
      .filter((s) => s.end > s.start);

    const mapping = new Map<string, string>();
    const labels = new Set(spans.map((s) => s.speaker));
    for (const label of labels) {
      if (chunk.chunkIndex === 0 || known.has(label)) {
        mapping.set(label, label);
        continue;
      }
      // Time this label shares with each earlier speaker inside the overlap.
      const shared = new Map<string, number>();
      let own = 0;
      for (const span of spans) {
        if (span.speaker !== label) continue;
        const inOverlap = clip(span, -Infinity, chunk.ownFrom);
        if (!inOverlap) continue;
        own += inOverlap.end - inOverlap.start;
        for (const earlier of merged) {
          const ov = Math.min(inOverlap.end, earlier.end) - Math.max(inOverlap.start, earlier.start);
          if (ov > 0) shared.set(earlier.speaker, (shared.get(earlier.speaker) ?? 0) + ov);
        }
      }
      const [best, bestSeconds] = [...shared.entries()].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
      const matched = best !== undefined && bestSeconds >= MIN_MATCH_SECONDS && bestSeconds >= own * MIN_MATCH_FRACTION;
      mapping.set(label, matched ? best : `chunk${chunk.chunkIndex}:${label}`);
    }

    for (const span of spans) {
      const owned = clip(span, chunk.ownFrom, Infinity);
      if (owned) merged.push({ ...owned, speaker: mapping.get(span.speaker)! });
    }
  }

  return merged.sort((a, b) => a.start - b.start);
}

/** Each speaker's longest span, trimmed to at most `maxSeconds`, for use as a voice reference. */
export function pickReferenceSpans(
  spans: SpeakerSpan[],
  { maxSpeakers = 4, minSeconds = 2, maxSeconds = 8 } = {}
): SpeakerSpan[] {
  const longest = new Map<string, SpeakerSpan>();
  for (const s of spans) {
    const current = longest.get(s.speaker);
    if (!current || s.end - s.start > current.end - current.start) longest.set(s.speaker, s);
  }
  return [...longest.values()]
    .filter((s) => s.end - s.start >= minSeconds)
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, maxSpeakers)
    .map((s) => ({ ...s, end: Math.min(s.end, s.start + maxSeconds) }));
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

/** The speaker of the span overlapping this word most, or else the nearest span. */
function speakerForWord(word: TranscriptWord, spans: SpeakerSpan[]): string | undefined {
  let best: SpeakerSpan | undefined;
  let bestScore = -Infinity;
  for (const s of spans) {
    const ov = overlap(word.start, word.end, s.start, s.end);
    // Overlap wins; for words falling in a gap between spans, prefer the
    // closest (negative overlap = distance).
    if (ov > bestScore) {
      bestScore = ov;
      best = s;
    }
  }
  return best?.speaker;
}

/** A run shorter than this (words and seconds) is treated as boundary jitter and absorbed by its neighbor. */
const MIN_RUN_WORDS = 2;
const MIN_RUN_SECONDS = 0.6;

type Run = { speaker: string | undefined; words: TranscriptWord[] };

function smoothRuns(runs: Run[]): Run[] {
  if (runs.length <= 1) return runs;
  const result: Run[] = [];
  for (const run of runs) {
    const duration = run.words[run.words.length - 1].end - run.words[0].start;
    const tiny = run.words.length < MIN_RUN_WORDS && duration < MIN_RUN_SECONDS;
    const previous = result[result.length - 1];
    if (tiny && previous) {
      previous.words.push(...run.words);
    } else if (previous && previous.speaker === run.speaker) {
      previous.words.push(...run.words);
    } else {
      result.push({ speaker: run.speaker, words: [...run.words] });
    }
  }
  // A tiny leading run can't merge backwards -- fold it into the next one.
  if (result.length > 1) {
    const first = result[0];
    const duration = first.words[first.words.length - 1].end - first.words[0].start;
    if (first.words.length < MIN_RUN_WORDS && duration < MIN_RUN_SECONDS) {
      result[1].words.unshift(...first.words);
      result.shift();
    }
  }
  return result;
}

/**
 * Splits segment text to match word runs. Text tokens map to words by
 * position (the same assumption lib/timeline/sentences.ts makes), so each
 * part keeps its original punctuation; any leftover tokens go to the last part.
 */
function splitText(text: string, runLengths: number[]): string[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let index = 0;
  return runLengths.map((length, i) => {
    const slice = i === runLengths.length - 1 ? tokens.slice(index) : tokens.slice(index, index + length);
    index += length;
    return slice.join(" ");
  });
}

/**
 * Labels every segment with a speaker, splitting segments where the speaker
 * changes mid-segment. Speakers are named "Speaker 1", "Speaker 2", ... in
 * order of first appearance. Word ids and timings are untouched (cuts and
 * other edits reference times, so re-numbered segment ids are safe);
 * existing manual labels are replaced.
 */
export function assignSpeakers(transcript: Transcript, spans: SpeakerSpan[]): Transcript {
  if (spans.length === 0) return transcript;

  const names = new Map<string, string>();
  const nameFor = (key: string | undefined) => {
    if (key === undefined) return undefined;
    if (!names.has(key)) names.set(key, `Speaker ${names.size + 1}`);
    return names.get(key);
  };

  const segments: TranscriptSegment[] = [];
  for (const segment of transcript.segments) {
    if (segment.words.length === 0) {
      segments.push({ ...segment, id: `segment-${segments.length}` });
      continue;
    }

    const runs: Run[] = [];
    for (const word of segment.words) {
      const speaker = speakerForWord(word, spans);
      const last = runs[runs.length - 1];
      if (last && last.speaker === speaker) last.words.push(word);
      else runs.push({ speaker, words: [word] });
    }
    const smoothed = smoothRuns(runs);
    const texts = splitText(segment.text, smoothed.map((r) => r.words.length));

    smoothed.forEach((run, i) => {
      const { speaker: _previousLabel, ...rest } = segment;
      const name = nameFor(run.speaker);
      segments.push({
        ...rest,
        id: `segment-${segments.length}`,
        start: smoothed.length === 1 ? segment.start : run.words[0].start,
        end: smoothed.length === 1 ? segment.end : run.words[run.words.length - 1].end,
        text: smoothed.length === 1 ? segment.text : texts[i],
        words: run.words,
        ...(name ? { speaker: name } : {}),
      });
    });
  }

  return { ...transcript, segments };
}
