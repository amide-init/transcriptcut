import { describe, expect, it } from "vitest";
import { groupWordsIntoSegments } from "@/lib/ai/transcribe";

const w = (text: string, start: number, end: number, i = 0) => ({ id: `word-${i}`, text, start, end });

describe("groupWordsIntoSegments", () => {
  it("keeps a word that starts before its segment (real Whisper output)", () => {
    // From a real whisper-1 response: "Thanks" is timed 6.40-6.70 but its
    // segment starts at 6.68, after the previous one ended at 5.78.
    const segments = groupWordsIntoSegments(
      [w("recording", 4.58, 5.2, 0), w("studios", 5.2, 5.78, 1), w("Thanks", 6.4, 6.7, 2), w("for", 6.7, 6.9, 3)],
      [
        { start: 4.58, end: 5.78, text: " recording studios." },
        { start: 6.68, end: 10.8, text: " Thanks for having me," },
      ]
    );
    expect(segments.map((s) => s.words.map((x) => x.text))).toEqual([["recording", "studios"], ["Thanks", "for"]]);
    // The segment grows to cover its first word.
    expect(segments[1].start).toBe(6.4);
  });

  it("never drops a word: every word lands in exactly one segment, in order", () => {
    const words = [w("a", 0, 1, 0), w("b", 1.9, 2.3, 1), w("c", 2.9, 3.2, 2), w("d", 5.5, 6, 3), w("e", 9, 9.5, 4)];
    const segments = groupWordsIntoSegments(words, [
      { start: 0, end: 2, text: "a b" },
      { start: 3, end: 5, text: "c" },
      { start: 6.2, end: 8, text: "d e" },
    ]);
    const placed = segments.flatMap((s) => s.words.map((x) => x.id));
    expect(placed).toEqual(words.map((x) => x.id));
  });

  it("puts a word in a gap with the nearest segment", () => {
    const segments = groupWordsIntoSegments([w("x", 0, 1, 0), w("gap", 4.6, 4.9, 1), w("y", 6, 7, 2)], [
      { start: 0, end: 1, text: "x" },
      { start: 5, end: 7, text: "gap y" },
    ]);
    expect(segments[1].words.map((x) => x.text)).toEqual(["gap", "y"]);
  });

  it("assigns by largest overlap when a word straddles a boundary", () => {
    const segments = groupWordsIntoSegments([w("mostly-first", 1.7, 2.2, 0)], [
      { start: 0, end: 2, text: "" },
      { start: 2, end: 4, text: "" },
    ]);
    expect(segments[0].words).toHaveLength(1);
    expect(segments[0].end).toBe(2.2);
  });

  it("never assigns a later word to an earlier segment than the word before it", () => {
    // Overlapping raw segments (Whisper produces these) must not reorder words.
    const segments = groupWordsIntoSegments([w("one", 0, 1, 0), w("two", 1, 2, 1), w("three", 2, 3, 2)], [
      { start: 0, end: 3, text: "one" },
      { start: 0.9, end: 2.1, text: "two three" },
    ]);
    const order = segments.flatMap((s) => s.words.map((x) => x.text));
    expect(order).toEqual(["one", "two", "three"]);
  });
});
