import { describe, expect, it } from "vitest";
import { splitIntoSentences } from "@/lib/timeline/sentences";
import type { TranscriptSegment, TranscriptWord } from "@/types/transcript";

function word(id: string, text: string, start: number, end: number): TranscriptWord {
  return { id, text, start, end };
}

function segment(text: string, words: TranscriptWord[]): TranscriptSegment {
  return { id: "s1", start: words[0]?.start ?? 0, end: words[words.length - 1]?.end ?? 0, text, words };
}

describe("splitIntoSentences", () => {
  it("returns nothing for a segment with no words", () => {
    expect(splitIntoSentences(segment("", []))).toEqual([]);
  });

  it("keeps a single-sentence segment as one sentence", () => {
    const words = [word("1", "hello", 0, 0.5), word("2", "world", 0.5, 1)];
    const result = splitIntoSentences(segment("hello world", words));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ words, start: 0, end: 1 });
  });

  it("splits a multi-sentence segment by terminal punctuation, mapped back onto word timestamps", () => {
    const words = [
      word("1", "Hi", 0, 0.3),
      word("2", "there", 0.3, 0.6),
      word("3", "How", 1, 1.3),
      word("4", "are", 1.3, 1.6),
      word("5", "you", 1.6, 2),
    ];
    const result = splitIntoSentences(segment("Hi there. How are you?", words));
    expect(result).toHaveLength(2);
    expect(result[0].words.map((w) => w.text)).toEqual(["Hi", "there"]);
    expect(result[0]).toMatchObject({ start: 0, end: 0.6 });
    expect(result[1].words.map((w) => w.text)).toEqual(["How", "are", "you"]);
    expect(result[1]).toMatchObject({ start: 1, end: 2 });
  });

  it("appends leftover words as a trailing group instead of dropping them", () => {
    // The text's word-count-by-whitespace can undercount segment.words
    // (contractions, punctuation quirks per the function's own doc comment)
    // -- simulate that by having more real words than the text accounts for.
    const words = [word("1", "Hi", 0, 0.3), word("2", "there", 0.3, 0.6), word("3", "extra", 0.6, 0.9)];
    const result = splitIntoSentences(segment("Hi. there.", words));
    const allWords = result.flatMap((s) => s.words);
    expect(allWords.map((w) => w.text)).toEqual(["Hi", "there", "extra"]);
  });
});
