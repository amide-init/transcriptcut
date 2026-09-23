import { describe, expect, it } from "vitest";
import { detectFillerWords } from "@/lib/ai/filler-words";
import type { Transcript, TranscriptWord } from "@/types/transcript";

function word(id: string, text: string): TranscriptWord {
  return { id, text, start: 0, end: 0 };
}

function transcript(words: TranscriptWord[], text: string): Transcript {
  return { id: "t1", segments: [{ id: "s1", start: 0, end: 0, text, words }] };
}

// Only the deterministic "always filler" path is tested here -- it's the
// only branch that returns without an OpenAI call (detectFillerWords
// returns early once there are no context-dependent candidates), so it's
// the only part of this file safe to test without mocking the network.
// Context-dependent words ("like", "basically", ...) require an LLM call
// and are out of scope for a deterministic unit test (claude.md section 25:
// prioritize deterministic tests).
describe("detectFillerWords (deterministic 'always filler' path only)", () => {
  it("flags standalone um/uh variants without needing an API call", async () => {
    const words = [word("1", "um"), word("2", "Hello"), word("3", "uh"), word("4", "world")];
    const ids = await detectFillerWords(transcript(words, "um Hello uh world"));
    expect(ids.sort()).toEqual(["1", "3"]);
  });

  it("is case-insensitive", async () => {
    const words = [word("1", "Um"), word("2", "UHH")];
    const ids = await detectFillerWords(transcript(words, "Um UHH"));
    expect(ids.sort()).toEqual(["1", "2"]);
  });

  it("returns nothing for a transcript with no filler candidates at all", async () => {
    const words = [word("1", "Hello"), word("2", "world")];
    const ids = await detectFillerWords(transcript(words, "Hello world"));
    expect(ids).toEqual([]);
  });
});
