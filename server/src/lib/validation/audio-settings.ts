import { z } from "zod";
import { DEFAULT_AUDIO_SETTINGS, DENOISE_LEVELS, LOUDNESS_TARGETS, type AudioSettings } from "@/types/audio-settings";

export const audioSettingsSchema = z.object({
  loudnessTarget: z.enum(LOUDNESS_TARGETS),
  denoise: z.enum(DENOISE_LEVELS),
  levelSpeakers: z.boolean(),
  highpass: z.boolean(),
});

/**
 * Reads Project.audioSettingsJson, falling back to all-off for null or for
 * anything that no longer validates (e.g. written by an older version), so
 * a bad stored value can never reach the ffmpeg argv.
 */
export function parseStoredAudioSettings(json: string | null): AudioSettings {
  if (!json) return DEFAULT_AUDIO_SETTINGS;
  try {
    const parsed = audioSettingsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : DEFAULT_AUDIO_SETTINGS;
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}
