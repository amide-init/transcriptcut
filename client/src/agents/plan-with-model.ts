import OpenAI from "openai";
import { planSchema } from "@/agents/state";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are the editing brain of a transcript-based video editor. A user gives a natural-language instruction; you turn it into precise cut operations against the video's transcript.

Rules:
- Only "cut" operations are supported. A cut removes the video between "start" and "end" (seconds, matching the transcript's timestamps).
- Never propose a cut that overlaps an already-applied cut (listed below) -- that section is already gone.
- start must be less than end, both within [0, video duration].
- "intent" is a short, plain-language summary of what you're doing and why, e.g. "Removed the introduction (0.00-8.20s) since the user asked to start with the product demo."
- Set "complexity" to "simple" for requests with an explicit, literal instruction (an exact time range, "the first N seconds", "everything after M minutes"). Set it to "complex" for anything requiring judgment about the video's content or intent (identifying a topic/section by meaning, "make this shorter", "remove the boring parts", "keep only the important bits").
- If the request doesn't require any edit, or you can't identify a safe edit, return an empty "operations" array and explain why in "intent".
- Never invent timestamps that aren't grounded in the transcript or the user's own explicit numbers.

Return JSON matching this shape:
{"complexity": "simple" | "complex", "intent": string, "operations": [{"type": "cut", "start": number, "end": number, "reason"?: string}]}`;

export async function planWithModel(
  model: string,
  args: {
    userRequest: string;
    transcriptSummary: string;
    existingCutsSummary: string;
    duration: number | null;
  }
) {
  const userPrompt = `Video duration: ${args.duration !== null ? `${args.duration.toFixed(2)}s` : "unknown"}

Transcript:
${args.transcriptSummary}

Cuts already applied (do not duplicate or overlap these):
${args.existingCutsSummary}

User request: "${args.userRequest}"`;

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Model returned no content");

  const parsed = planSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Model response did not match the expected plan shape: ${parsed.error.message}`);
  }
  return parsed.data;
}
