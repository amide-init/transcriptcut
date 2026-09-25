import { z } from "zod";
import { completeJson, numberedTranscript, PublishingAiError } from "@/lib/ai/publishing";
import type { EditedSentence } from "@/lib/publishing/edited-transcript";
import type { ScenePick } from "@/lib/scenes/suggest";

/**
 * "Suggest scenes": the model reads the edited transcript and names the
 * sentences where each topic starts. Like chapters (lib/ai/publishing.ts)
 * it only returns sentence indices and titles -- never times, never edit
 * operations -- and the response is schema-validated; lib/scenes/suggest.ts
 * then turns it into boundaries the user reviews before anything changes.
 * gpt-4o-mini: segmenting a transcript is structured extraction (section 4).
 */

const scenePicksSchema = z.object({
  scenes: z
    .array(
      z.object({
        sentenceIndex: z.number().int(),
        title: z.string().min(1).max(200),
      })
    )
    .max(60),
});

/** About one scene per 4-8 minutes -- finer than chapters, which run 5-8. */
function sceneGuidance(totalSeconds: number): string {
  const minutes = totalSeconds / 60;
  const low = Math.max(2, Math.round(minutes / 8));
  const high = Math.max(low, Math.round(minutes / 4));
  return `${low}-${high}`;
}

export async function generateScenePicks(sentences: EditedSentence[], minGapSeconds: number): Promise<ScenePick[]> {
  if (sentences.length === 0) return [];
  const total = sentences[sentences.length - 1].end;
  const system = [
    "You split podcast episodes into scenes for a video editor: stretches of conversation about one topic.",
    'Reply with JSON: {"scenes": [{"sentenceIndex": number, "title": string}]}.',
    "sentenceIndex is the [number] of the sentence where the scene starts. The first scene starts at sentence 0.",
    `The episode runs ${Math.round(total / 60)} minutes: sentences [0] to [${sentences.length - 1}]; the timestamp after each [number] shows where you are.`,
    `Read to the end before answering. Your last scene must start after sentence [${Math.round(sentences.length * 0.6)}].`,
    `Aim for ${sceneGuidance(total)} scenes spread across the WHOLE episode, from the start to the final minutes, at least ${Math.round(minGapSeconds)} seconds apart, each starting where the conversation clearly moves to a new topic.`,
    "Titles are short (2-6 words), specific to what's discussed, in title case, with no numbering and no quotes. They appear on title cards.",
  ].join("\n");
  const raw = await completeJson(system, numberedTranscript(sentences));
  const parsed = scenePicksSchema.safeParse(raw);
  if (!parsed.success) throw new PublishingAiError("The model's scene list wasn't in the expected shape.");
  return parsed.data.scenes;
}
