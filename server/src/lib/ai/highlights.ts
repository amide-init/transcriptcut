import OpenAI from "openai";
import { z } from "zod";
import { getOpenAiApiKey } from "@/lib/settings";
import { formatTimestamp, type EditedSentence } from "@/lib/publishing/edited-transcript";
import type { HighlightPick } from "@/lib/clips/clips";
import { HIGHLIGHT_MAX_SECONDS, HIGHLIGHT_MIN_SECONDS, MAX_HIGHLIGHTS } from "@/types/clips";

// Constructed fresh per call -- see the identical note in lib/ai/transcribe.ts.
function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey() });
}

/**
 * Picking the moments worth clipping means judging the whole episode --
 * what's surprising, funny or quotable, and where a thought starts and ends
 * -- which is the "selecting important sections" work claude.md section 4
 * routes to GPT-5.6 Luna rather than GPT-4o-mini.
 */
const HIGHLIGHTS_MODEL = "gpt-5.6-luna";

const picksSchema = z.object({
  clips: z
    .array(
      z.object({
        startSentence: z.number().int(),
        endSentence: z.number().int(),
        title: z.string().min(1).max(200),
        reason: z.string().max(600),
      })
    )
    .max(30),
});

/**
 * Returns sentence-index ranges only -- never timestamps -- which
 * lib/clips/clips.ts#highlightsFromPicks turns into validated clips.
 */
export async function findHighlightPicks(sentences: EditedSentence[]): Promise<HighlightPick[]> {
  const longForm = sentences.length > 0 && sentences[sentences.length - 1].end >= 3600;
  const transcript = sentences
    .map((s, i) => `[${i}] ${formatTimestamp(s.start, longForm)} ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`)
    .join("\n");

  const completion = await getOpenAI().chat.completions.create({
    model: HIGHLIGHTS_MODEL,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You pick the best moments of a podcast episode to post as short vertical clips (YouTube Shorts, Reels, TikTok). A good clip makes sense to someone who never heard the episode: it opens with a hook or a clear question, holds one complete thought, story, opinion or piece of advice, and ends when that thought lands -- never mid-sentence or mid-argument. Prefer surprising, funny, emotional, contrarian or practical moments over introductions, sponsor reads and small talk. Titles are short and specific, like a video title, with no emojis or hashtags.",
      },
      {
        role: "user",
        content: `Transcript, one sentence per line as [index] timestamp text:\n"""\n${transcript}\n"""\n\nPick up to ${MAX_HIGHLIGHTS} clips, best first. Each clip must be ${HIGHLIGHT_MIN_SECONDS}-${HIGHLIGHT_MAX_SECONDS} seconds long (use the timestamps), and clips must not overlap. Pick fewer if the episode doesn't have that many strong moments. Return JSON {"clips": [{"startSentence": number, "endSentence": number, "title": string, "reason": string}]} where startSentence/endSentence are the [index] of the first and last sentence (inclusive), and reason is one sentence on why it works as a clip.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("The model returned an empty response.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("The model returned invalid JSON.");
  }
  const parsed = picksSchema.safeParse(json);
  if (!parsed.success) throw new Error("The model's clips didn't match the expected format.");
  return parsed.data.clips;
}
