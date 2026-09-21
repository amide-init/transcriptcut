import OpenAI from "openai";
import { z } from "zod";
import type { Transcript } from "@/types/transcript";

// Constructed lazily, not at module scope -- see the identical note in
// lib/ai/transcribe.ts. Deferred to first actual call so importing this
// module (e.g. during `next build`'s page-data collection) doesn't
// require OPENAI_API_KEY to already be set.
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

/**
 * Detects filler words in a transcript, for the "Remove all filler words"
 * editor action (claude.md section 27 #3). This is the detection half only
 * — turning the result into cut EditOperations happens client-side via the
 * existing useTimelineStore.addCut pipeline, per the issue's own guidance.
 * Designed to become the removeFillerWords() agent tool from section 7 once
 * the Director/Editor/Validator agents (issue #5) exist: an agent would call
 * this, then emit cuts through the same operations pipeline the UI uses.
 */

// Almost never meaningful on their own — flagged without spending an LLM call.
const ALWAYS_FILLER = new Set(["um", "umm", "uh", "uhh", "erm"]);

// Multi-word phrases that are often, but not always, filler — need context.
const CONTEXT_PHRASES = ["you know", "i mean", "kind of", "sort of"];

// Single words that are often, but not always, filler — need context.
// Deliberately a short list: words like "so"/"well"/"right"/"just" are too
// often structurally meaningful to guess at without much higher false-positive
// risk than this MVP should take (claude.md section 27's explicit warning).
const CONTEXT_SINGLE = new Set(["like", "basically", "actually", "literally"]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z']/g, "");
}

type Candidate = {
  key: string;
  wordIds: string[];
  text: string;
  /** Local context with the candidate span marked, e.g. "...I really [[like]] how it turned..." */
  context: string;
};

const CONTEXT_WINDOW = 4;

/**
 * A few words of context is not just helpful, it's required: when the same
 * word (e.g. "like") appears more than once, a candidate list with no
 * context forces the model to count occurrences in the full transcript to
 * figure out which "like" is which — exactly the kind of position-counting
 * small models get wrong. Anchoring each candidate to its own local context
 * removes that ambiguity entirely.
 */
function buildContext(words: Transcript["segments"][number]["words"], startIdx: number, endIdx: number): string {
  const before = words.slice(Math.max(0, startIdx - CONTEXT_WINDOW), startIdx).map((w) => w.text);
  const span = words.slice(startIdx, endIdx).map((w) => w.text);
  const after = words.slice(endIdx, endIdx + CONTEXT_WINDOW).map((w) => w.text);
  const prefix = startIdx - CONTEXT_WINDOW > 0 ? "…" : "";
  const suffix = endIdx + CONTEXT_WINDOW < words.length ? "…" : "";
  return `${prefix}${[...before, `[[${span.join(" ")}]]`, ...after].join(" ")}${suffix}`;
}

const classificationSchema = z.object({
  fillerCandidateKeys: z.array(z.string()),
});

async function classifyCandidates(transcript: Transcript, candidates: Candidate[]): Promise<string[]> {
  const fullText = transcript.segments.map((s) => s.text).join(" ");
  const candidateList = candidates.map((c) => `${c.key}: ${c.context}`).join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You identify filler words and disfluencies in a spoken-word transcript that can be deleted without changing its meaning. Each candidate below shows the word/phrase in question marked with [[double brackets]] inside its local context — judge only that marked span using its own context, not the rest of the transcript. Only flag genuine fillers. Never flag a candidate that carries real meaning in context — e.g. 'like' used as a verb ('I really [[like]] how it turned out', 'customers will [[like]] it') or for comparison ('it looks like rain'), 'you know' introducing a real fact the listener might not know, 'basically' meaningfully summarizing, or 'actually'/'literally' used for genuine emphasis or correction.",
      },
      {
        role: "user",
        content: `Full transcript (for topic context only):\n"""${fullText}"""\n\nCandidates:\n${candidateList}\n\nReturn JSON of the shape {"fillerCandidateKeys": string[]} listing only the candidate keys whose [[marked span]] is a true filler word/disfluency, safe to delete.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }

  const parsed = classificationSchema.safeParse(parsedJson);
  if (!parsed.success) return [];

  const confirmedKeys = new Set(parsed.data.fillerCandidateKeys);
  return candidates.filter((c) => confirmedKeys.has(c.key)).flatMap((c) => c.wordIds);
}

export async function detectFillerWords(transcript: Transcript): Promise<string[]> {
  const words = transcript.segments.flatMap((s) => s.words);
  const alwaysFillerIds: string[] = [];
  const candidates: Candidate[] = [];

  for (let i = 0; i < words.length; i++) {
    const norm = normalize(words[i].text);

    if (ALWAYS_FILLER.has(norm)) {
      alwaysFillerIds.push(words[i].id);
      continue;
    }

    let matchedPhrase = false;
    for (const phrase of CONTEXT_PHRASES) {
      const phraseWords = phrase.split(" ");
      const slice = words.slice(i, i + phraseWords.length);
      if (slice.length === phraseWords.length && slice.every((w, j) => normalize(w.text) === phraseWords[j])) {
        candidates.push({
          key: `c${candidates.length}`,
          wordIds: slice.map((w) => w.id),
          text: phrase,
          context: buildContext(words, i, i + phraseWords.length),
        });
        matchedPhrase = true;
        break;
      }
    }
    if (matchedPhrase) continue;

    if (CONTEXT_SINGLE.has(norm)) {
      candidates.push({
        key: `c${candidates.length}`,
        wordIds: [words[i].id],
        text: words[i].text,
        context: buildContext(words, i, i + 1),
      });
    }
  }

  if (candidates.length === 0) return alwaysFillerIds;

  const confirmed = await classifyCandidates(transcript, candidates);
  return [...alwaysFillerIds, ...confirmed];
}
