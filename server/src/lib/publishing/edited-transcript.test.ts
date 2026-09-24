import { describe, expect, it } from "vitest";
import { buildEditedSentences, formatTimestamp, formatTranscript } from "@/lib/publishing/edited-transcript";
import type { Transcript } from "@/types/transcript";

const w = (id: string, text: string, start: number, end: number) => ({ id, text, start, end });

const transcript: Transcript = {
  id: "t",
  segments: [
    {
      id: "s0",
      start: 0,
      end: 4,
      text: "Hello there. Um okay.",
      speaker: "Ana",
      words: [w("w0", "Hello", 0, 0.5), w("w1", "there.", 0.5, 1), w("w2", "Um", 2, 2.5), w("w3", "okay.", 3, 4)],
    },
    {
      id: "s1",
      start: 10,
      end: 12,
      text: "Welcome back.",
      speaker: "Ben",
      words: [w("w4", "Welcome", 10, 11), w("w5", "back.", 11, 12)],
    },
  ],
};

describe("buildEditedSentences", () => {
  it("drops cut words, keeps source start, and maps times onto the edited timeline", () => {
    const sentences = buildEditedSentences(transcript, [{ id: "c", type: "cut", start: 1.9, end: 2.6, createdAt: 0 }], 20);
    expect(sentences.map((s) => [s.text, s.sourceStart, s.speaker])).toEqual([
      ["Hello there.", 0, "Ana"],
      ["okay.", 3, "Ana"],
      ["Welcome back.", 10, "Ben"],
    ]);
    expect(sentences[2].start).toBeCloseTo(10 - 0.7);
  });
});

describe("formatTimestamp", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatTimestamp(65)).toBe("01:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
    expect(formatTimestamp(65, true)).toBe("0:01:05");
  });
});

describe("formatTranscript", () => {
  const sentences = buildEditedSentences(transcript, [], 20);

  it("groups consecutive sentences by speaker, with timestamps", () => {
    expect(formatTranscript(sentences, "txt", "Ep 1")).toBe(
      "Ep 1\n\n[00:00] Ana: Hello there. Um okay.\n\n[00:10] Ben: Welcome back.\n"
    );
  });

  it("writes Markdown with a heading and bold stamps", () => {
    expect(formatTranscript(sentences, "md", "Ep 1")).toBe(
      "# Ep 1\n\n**[00:00] Ana:** Hello there. Um okay.\n\n**[00:10] Ben:** Welcome back.\n"
    );
  });
});
