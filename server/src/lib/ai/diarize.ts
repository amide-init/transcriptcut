import OpenAI from "openai";
import { z } from "zod";
import { getOpenAiApiKey } from "@/lib/settings";
import type { SpeakerSpan } from "@/lib/ai/speakers";

// Constructed fresh per call -- see the identical note in lib/ai/transcribe.ts.
function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey() });
}

/** Voice samples that pin speaker names across separate diarization calls. */
export type KnownSpeakers = { names: string[]; references: string[] };

const diarizedResponseSchema = z.object({
  segments: z.array(
    z.object({
      speaker: z.string().min(1).max(100),
      start: z.number().finite(),
      end: z.number().finite(),
    })
  ),
});

/**
 * Speaker diarization via gpt-4o-transcribe-diarize: who spoke when, as
 * labeled spans (the model returns no word timings, so Whisper stays the
 * source of truth for words -- see lib/ai/speakers.ts). Kept behind this
 * one function so the provider can be swapped (claude.md section 29).
 *
 * `known` passes 2-10s reference clips (data URLs) under fixed names, so a
 * later chunk's labels line up with an earlier chunk's -- without them,
 * labels are only consistent within a single call (measured: a guest
 * labeled "B" in one chunk came back as "C" in the next).
 */
export async function diarizeFile(file: File, known?: KnownSpeakers): Promise<SpeakerSpan[]> {
  const response = await getOpenAI().audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe-diarize",
    response_format: "diarized_json",
    // Required by this model for anything over 30s.
    chunking_strategy: "auto",
    ...(known && known.names.length > 0
      ? { known_speaker_names: known.names, known_speaker_references: known.references }
      : {}),
  });
  const parsed = diarizedResponseSchema.safeParse(response);
  if (!parsed.success) throw new Error("Speaker detection returned an unexpected response.");
  return parsed.data.segments.map((s) => ({ speaker: s.speaker, start: s.start, end: s.end }));
}
