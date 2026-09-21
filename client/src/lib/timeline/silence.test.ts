import { describe, expect, it } from "vitest";
import { detectSilences } from "@/lib/timeline/silence";
import type { Transcript, TranscriptWord } from "@/types/transcript";

function word(id: string, start: number, end: number): TranscriptWord {
  return { id, text: "w", start, end };
}

function transcript(words: TranscriptWord[][]): Transcript {
  return {
    id: "t1",
    segments: words.map((ws, i) => ({
      id: `seg${i}`,
      start: ws[0]?.start ?? 0,
      end: ws[ws.length - 1]?.end ?? 0,
      text: "",
      words: ws,
    })),
  };
}

describe("detectSilences", () => {
  it("finds a gap at/above the threshold", () => {
    const t = transcript([[word("1", 0, 1), word("2", 3, 4)]]);
    expect(detectSilences(t, 1.5)).toEqual([{ start: 1, end: 3 }]);
  });

  it("ignores a gap below the threshold", () => {
    const t = transcript([[word("1", 0, 1), word("2", 1.5, 2)]]);
    expect(detectSilences(t, 1.5)).toEqual([]);
  });

  it("treats a gap exactly at the threshold as a silence", () => {
    const t = transcript([[word("1", 0, 1), word("2", 2.5, 3)]]);
    expect(detectSilences(t, 1.5)).toEqual([{ start: 1, end: 2.5 }]);
  });

  it("finds gaps across segment boundaries, not just within one segment", () => {
    const t = transcript([[word("1", 0, 1)], [word("2", 5, 6)]]);
    expect(detectSilences(t, 1.5)).toEqual([{ start: 1, end: 5 }]);
  });

  it("returns nothing for fewer than two words", () => {
    expect(detectSilences(transcript([[word("1", 0, 1)]]))).toEqual([]);
    expect(detectSilences(transcript([[]]))).toEqual([]);
  });

  it("uses the default threshold when none is given", () => {
    const t = transcript([[word("1", 0, 1), word("2", 2.4, 3)]]);
    expect(detectSilences(t)).toEqual([]);
    const t2 = transcript([[word("1", 0, 1), word("2", 2.6, 3)]]);
    expect(detectSilences(t2)).toEqual([{ start: 1, end: 2.6 }]);
  });
});
