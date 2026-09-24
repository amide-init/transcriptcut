import { describe, expect, it } from "vitest";
import { isDegenerateRepeat, mergeChunkTranscripts, planChunks } from "@/lib/ai/chunking";
import type { Transcript } from "@/types/transcript";

const opts = { targetSeconds: 600, searchWindowSeconds: 90 };

describe("planChunks", () => {
  it("returns a single chunk for audio shorter than a chunk", () => {
    expect(planChunks(120, [], opts)).toEqual([{ index: 0, start: 0, end: 120 }]);
  });

  it("returns nothing for zero-length audio", () => {
    expect(planChunks(0, [], opts)).toEqual([]);
  });

  it("folds a short tail into the last chunk instead of making a sliver", () => {
    expect(planChunks(700, [], opts)).toEqual([{ index: 0, start: 0, end: 700 }]);
  });

  it("hard-cuts at the target when there's no silence nearby", () => {
    expect(planChunks(1500, [], opts)).toEqual([
      { index: 0, start: 0, end: 600 },
      { index: 1, start: 600, end: 1200 },
      { index: 2, start: 1200, end: 1500 },
    ]);
  });

  it("puts the boundary mid-silence, picking the silence closest to the target", () => {
    const silences = [
      { start: 540, end: 541 }, // 59.5s early
      { start: 620, end: 622 }, // 21s late -- closest
      { start: 900, end: 901 },
    ];
    const chunks = planChunks(1500, silences, opts);
    expect(chunks[0]).toEqual({ index: 0, start: 0, end: 621 });
    expect(chunks[1].start).toBe(621);
  });

  it("ignores silences outside the search window", () => {
    const chunks = planChunks(1500, [{ start: 300, end: 301 }], opts);
    expect(chunks[0].end).toBe(600);
  });

  it("covers the whole duration with contiguous chunks", () => {
    const silences = Array.from({ length: 40 }, (_, i) => ({ start: i * 173 + 50, end: i * 173 + 51 }));
    const chunks = planChunks(7200, silences, opts);
    expect(chunks[0].start).toBe(0);
    expect(chunks[chunks.length - 1].end).toBe(7200);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBe(chunks[i - 1].end);
      expect(chunks[i].index).toBe(i);
    }
  });
});

function part(offset: number, words: [string, number, number][]): { offset: number; transcript: Transcript } {
  return {
    offset,
    transcript: {
      id: "x",
      segments: [
        {
          id: "segment-0",
          start: words[0][1],
          end: words[words.length - 1][2],
          text: words.map((w) => w[0]).join(" "),
          words: words.map(([text, start, end], i) => ({ id: `word-${i}`, text, start, end })),
        },
      ],
    },
  };
}

describe("mergeChunkTranscripts", () => {
  it("shifts timestamps by each chunk's offset and orders by time", () => {
    const merged = mergeChunkTranscripts([
      part(600, [["world", 1, 1.5]]),
      part(0, [["hello", 2, 2.4]]),
    ]);
    expect(merged.segments.map((s) => [s.text, s.start, s.end])).toEqual([
      ["hello", 2, 2.4],
      ["world", 601, 601.5],
    ]);
    expect(merged.segments[1].words[0]).toMatchObject({ start: 601, end: 601.5 });
  });

  it("re-numbers segment and word ids so they're unique across chunks", () => {
    const merged = mergeChunkTranscripts([
      part(0, [["a", 0, 1], ["b", 1, 2]]),
      part(600, [["c", 0, 1]]),
    ]);
    expect(merged.segments.map((s) => s.id)).toEqual(["segment-0", "segment-1"]);
    expect(merged.segments.flatMap((s) => s.words.map((w) => w.id))).toEqual(["word-0", "word-1", "word-2"]);
  });

  it("handles chunks with no speech", () => {
    const merged = mergeChunkTranscripts([{ offset: 0, transcript: { id: "x", segments: [] } }, part(600, [["hi", 0, 1]])]);
    expect(merged.segments).toHaveLength(1);
    expect(merged.segments[0].start).toBe(600);
  });
});

describe("isDegenerateRepeat", () => {
  const seg = (text: string, times: [number, number][]) => ({
    id: "s",
    start: times[0][0],
    end: times[times.length - 1][1],
    text,
    words: times.map(([start, end], i) => ({ id: `w${i}`, text: "x", start, end })),
  });

  it("flags a repeat of the previous sentence made of zero-length words", () => {
    const previous = seg("This is a test.", [[1, 1.3], [1.3, 1.5], [1.5, 1.6], [1.6, 2]]);
    const repeat = seg("this is a test", [[2, 2.2], [2.2, 2.2], [2.2, 2.2], [2.2, 2.2]]);
    expect(isDegenerateRepeat(previous, repeat)).toBe(true);
  });

  it("keeps a genuinely repeated phrase with real timing", () => {
    const previous = seg("Yeah.", [[1, 1.4]]);
    const repeat = seg("Yeah.", [[1.6, 2]]);
    expect(isDegenerateRepeat(previous, repeat)).toBe(false);
  });

  it("keeps zero-length words when the text differs", () => {
    const previous = seg("Hello there.", [[1, 1.3], [1.3, 1.6]]);
    const other = seg("General Kenobi.", [[2, 2], [2, 2]]);
    expect(isDegenerateRepeat(previous, other)).toBe(false);
  });
});
