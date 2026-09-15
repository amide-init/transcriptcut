import type { TranscriptSegment, TranscriptWord } from "@/types/transcript";

export type Sentence = {
  words: TranscriptWord[];
  start: number;
  end: number;
};

/**
 * Splits a transcript segment into sentences by terminal punctuation. A
 * Whisper segment is a pause-based grouping and often spans several
 * sentences (claude.md section 2's "delete a sentence" vs "delete a
 * transcript segment" are genuinely different units, not aliases of the
 * same thing).
 *
 * Punctuation only lives on segment.text, never on individual word tokens
 * (OpenAI's word-timestamps API returns bare words) -- confirmed by
 * inspecting real transcribe output, where every TranscriptWord.text was
 * punctuation-free even though segment.text had periods. So sentence
 * boundaries are found in segment.text and mapped back onto word
 * timestamps by word count, not by testing word.text directly (that
 * regex would never match anything, silently making every "sentence"
 * span the whole segment).
 */
export function splitIntoSentences(segment: TranscriptSegment): Sentence[] {
  if (segment.words.length === 0) return [];

  const sentenceTexts = segment.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentenceTexts.length <= 1) {
    return [wordsToSentence(segment.words)];
  }

  const sentences: Sentence[] = [];
  let wordIndex = 0;
  for (const sentenceText of sentenceTexts) {
    const wordCount = sentenceText.split(/\s+/).filter(Boolean).length;
    const words = segment.words.slice(wordIndex, wordIndex + wordCount);
    if (words.length > 0) sentences.push(wordsToSentence(words));
    wordIndex += wordCount;
  }

  // Word-count mismatches (contractions, punctuation quirks) shouldn't
  // silently drop words -- any leftover becomes its own trailing group.
  if (wordIndex < segment.words.length) {
    sentences.push(wordsToSentence(segment.words.slice(wordIndex)));
  }

  return sentences;
}

function wordsToSentence(words: TranscriptWord[]): Sentence {
  return { words, start: words[0].start, end: words[words.length - 1].end };
}
