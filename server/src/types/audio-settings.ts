/**
 * Podcast-style audio cleanup applied at export (see
 * lib/ffmpeg/audio-filters.ts). Every option is an enum or boolean that
 * maps to fixed, app-defined ffmpeg values -- never a raw number from the
 * client (claude.md section 18).
 *
 * Duplicated in client/src/types/audio-settings.ts -- keep in sync.
 */

/** Integrated loudness target in LUFS. -16 is the podcast/Apple standard, -14 matches YouTube/Spotify normalization. */
export const LOUDNESS_TARGETS = ["off", "-16", "-14"] as const;
export type LoudnessTarget = (typeof LOUDNESS_TARGETS)[number];

export const DENOISE_LEVELS = ["off", "light", "strong"] as const;
export type DenoiseLevel = (typeof DENOISE_LEVELS)[number];

export type AudioSettings = {
  loudnessTarget: LoudnessTarget;
  denoise: DenoiseLevel;
  /** Evens out quiet and loud speakers (dynaudnorm). */
  levelSpeakers: boolean;
  /** 80Hz high-pass to remove rumble, desk thumps and mic-stand handling noise. */
  highpass: boolean;
};

/** All off, so existing projects export exactly as they did before these settings existed. */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  loudnessTarget: "off",
  denoise: "off",
  levelSpeakers: false,
  highpass: false,
};

/** One-click "podcast ready" preset offered in the Audio panel. */
export const PODCAST_AUDIO_PRESET: AudioSettings = {
  loudnessTarget: "-16",
  denoise: "light",
  levelSpeakers: true,
  highpass: true,
};
