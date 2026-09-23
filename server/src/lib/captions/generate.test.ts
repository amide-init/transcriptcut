import { describe, expect, it } from "vitest";
import { generateCaptions } from "@/lib/captions/generate";
import type { CutOperation } from "@/types/edit-operation";
import type { Transcript, TranscriptWord } from "@/types/transcript";

function word(id: string, text: string, start: number, end: number): TranscriptWord {
  return { id, text, start, end };
}

function cut(start: number, end: number): CutOperation {
  return { id: `${start}-${end}`, type: "cut", start, end, createdAt: 0 };
}

function transcript(words: TranscriptWord[]): Transcript {
  return {
    id: "t1",
    segments: [{ id: "s1", start: words[0]?.start ?? 0, end: words[words.length - 1]?.end ?? 0, text: "Hello there.", words }],
  };
}

describe("generateCaptions", () => {
  it("produces one cue per sentence with source-time timestamps when there are no cuts", () => {
    const words = [word("1", "Hello", 0, 0.5), word("2", "there", 0.5, 1)];
    const cues = generateCaptions(transcript(words), [], 10);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ start: 0, end: 1, text: "Hello there" });
  });

  it("drops a sentence entirely inside a cut", () => {
    const words = [word("1", "Hello", 0, 0.5), word("2", "there", 0.5, 1)];
    const cues = generateCaptions(transcript(words), [cut(0, 1)], 10);
    expect(cues).toEqual([]);
  });

  it("keeps only the surviving words of a partially cut sentence", () => {
    const words = [word("1", "Hello", 0, 0.5), word("2", "there", 0.5, 1)];
    const cues = generateCaptions(transcript(words), [cut(0, 0.5)], 10);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("there");
  });

  it("remaps timestamps onto the edited (post-cut) timeline, not source time", () => {
    // A cut before the sentence should shift its start/end back by the cut's length.
    const words = [word("1", "Hello", 5, 5.5), word("2", "there", 5.5, 6)];
    const cues = generateCaptions(transcript(words), [cut(0, 2)], 10);
    expect(cues[0]).toMatchObject({ start: 3, end: 4 });
  });

  it("includes per-word timing remapped the same way", () => {
    const words = [word("1", "Hello", 5, 5.5), word("2", "there", 5.5, 6)];
    const cues = generateCaptions(transcript(words), [cut(0, 2)], 10);
    expect(cues[0].words).toEqual([
      { start: 3, end: 3.5, text: "Hello" },
      { start: 3.5, end: 4, text: "there" },
    ]);
  });

  it("sorts cues by start time", () => {
    const t: Transcript = {
      id: "t1",
      segments: [
        { id: "s1", start: 5, end: 6, text: "Second.", words: [word("2", "Second", 5, 6)] },
        { id: "s2", start: 0, end: 1, text: "First.", words: [word("1", "First", 0, 1)] },
      ],
    };
    const cues = generateCaptions(t, [], 10);
    expect(cues.map((c) => c.text)).toEqual(["First", "Second"]);
  });
});
