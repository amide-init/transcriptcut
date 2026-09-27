import OpenAI from "openai";
import { z } from "zod";
import { getOpenAiApiKey } from "@/lib/settings";
import { formatTimestamp, type EditedSentence } from "@/lib/publishing/edited-transcript";
import { CHAPTER_TITLE_MAX } from "@/types/publishing";

// Constructed fresh per call -- see the identical note in lib/ai/transcribe.ts.
function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey() });
}

/**
 * AI publishing helpers: chapter picks and show notes. The model only ever
 * returns text and sentence indices -- never edit operations and never
 * timestamps -- and every response is schema-validated before use
 * (claude.md sections 22-23). gpt-4o-mini is enough here: summarizing and
 * segmenting a transcript is structured extraction, not multi-step editing
 * (section 4), and its 128k context fits a multi-hour episode.
 */

export class PublishingAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishingAiError";
  }
}

/** Numbered, timestamped lines, so the model can point at sentences by index. */
export function numberedTranscript(sentences: EditedSentence[]): string {
  const longForm = sentences.length > 0 && sentences[sentences.length - 1].end >= 3600;
  return sentences
    .map((s, i) => `[${i}] ${formatTimestamp(s.start, longForm)} ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`)
    .join("\n");
}

export async function completeJson(system: string, user: string): Promise<unknown> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new PublishingAiError("The model returned an empty response.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new PublishingAiError("The model returned invalid JSON.");
  }
}

const chapterPicksSchema = z.object({
  chapters: z
    .array(
      z.object({
        sentenceIndex: z.number().int(),
        title: z.string().min(1).max(200),
      })
    )
    .max(100),
});

export type ChapterPick = z.infer<typeof chapterPicksSchema>["chapters"][number];

/** Suggested chapter count for an episode of this length: about one per 5-8 minutes. */
function chapterGuidance(totalSeconds: number): string {
  const minutes = totalSeconds / 60;
  const low = Math.max(3, Math.round(minutes / 8));
  const high = Math.max(low, Math.round(minutes / 5));
  return `${low}-${high}`;
}

function describeDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;
}

/** `minGapSeconds` should match what the caller validates with (lib/publishing/chapters.ts#minChapterSeconds). */
export async function generateChapterPicks(sentences: EditedSentence[], minGapSeconds: number): Promise<ChapterPick[]> {
  const total = sentences[sentences.length - 1]?.end ?? 0;
  const json = await completeJson(
    "You split a podcast episode transcript into chapters, like the chapter markers on a YouTube video or in a podcast app. Each chapter starts where the conversation moves to a new topic. Chapter titles are short (2-6 words), specific to what is discussed, in title case, with no numbering, no timestamps, and no quotes. The first chapter starts at sentence 0.",
    `Transcript, one sentence per line as [index] timestamp text:\n"""\n${numberedTranscript(sentences)}\n"""\n\nThe episode is ${describeDuration(Math.round(total))} long. Pick ${chapterGuidance(total)} chapters that together cover the whole episode, from the start to the final minutes: each chapter must be at least ${describeDuration(minGapSeconds)} long, so group related sentences into broad sections rather than marking every mention of a new subject. Return JSON {"chapters": [{"sentenceIndex": number, "title": string}]} where sentenceIndex is the [index] of the sentence where that chapter begins. Titles at most ${CHAPTER_TITLE_MAX} characters.`
  );
  const parsed = chapterPicksSchema.safeParse(json);
  if (!parsed.success) throw new PublishingAiError("The model's chapters didn't match the expected format.");
  return parsed.data.chapters;
}

const showNotesSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  keyPoints: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
  titles: z.array(z.string().trim().min(1).max(150)).min(1).max(5),
});

export type GeneratedShowNotes = z.infer<typeof showNotesSchema>;

export async function generateShowNotes(sentences: EditedSentence[]): Promise<GeneratedShowNotes> {
  const json = await completeJson(
    "You write show notes for a podcast episode from its transcript. Write in a neutral, informative voice, in the language of the transcript. Only state what is actually said in the transcript -- never invent guests, links, sponsors, or facts. Describe what was said, not what a listener might learn: don't turn a mention of a topic into 'tips', 'insights', 'best practices' or 'guidance' unless the speakers actually give them. If the transcript has little substance, keep the notes short rather than padding them. No hashtags, no emojis.",
    `Transcript:\n"""\n${numberedTranscript(sentences)}\n"""\n\nReturn JSON {"summary": string, "keyPoints": string[], "titles": string[]}:\n- summary: 2-4 sentences describing what the episode covers\n- keyPoints: 1-7 short bullet points of the main things actually said\n- titles: 3 episode title suggestions, each under 70 characters`
  );
  const parsed = showNotesSchema.safeParse(json);
  if (!parsed.success) throw new PublishingAiError("The model's show notes didn't match the expected format.");
  return parsed.data;
}
