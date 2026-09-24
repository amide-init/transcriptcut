import type { AudioSettings, DenoiseLevel, LoudnessTarget } from "@/types/audio-settings";

/**
 * Maps AudioSettings (enums/booleans only) onto fixed ffmpeg audio filter
 * strings. Nothing client-supplied is ever interpolated here: every value
 * is a constant from these tables, or derived from a loudnorm measurement
 * that's parsed and range-checked as a finite number first (claude.md
 * section 18).
 *
 * Order matters and matches a typical podcast mastering chain:
 * highpass (drop rumble first, so it doesn't drive the later stages) ->
 * denoise -> speaker leveling -> loudness (always last, so it measures and
 * targets what the listener actually hears).
 */

const HIGHPASS_FILTER = "highpass=f=80";

/**
 * afftdn: nr = reduction in dB, nf = assumed noise floor in dB, tn = track
 * the noise profile over time (rooms change as people move, HVAC cycles).
 */
const DENOISE_FILTERS: Record<Exclude<DenoiseLevel, "off">, string> = {
  light: "afftdn=nr=10:nf=-50:tn=1",
  strong: "afftdn=nr=20:nf=-40:tn=1",
};

/**
 * dynaudnorm tuned for speech: 250ms frames and a 15-frame gaussian window
 * react to a change of speaker within a sentence or two, without pumping
 * on every word. m=8 caps the boost so near-silence isn't raised into
 * audible hiss.
 */
const LEVEL_SPEAKERS_FILTER = "dynaudnorm=f=250:g=15:p=0.9:m=8";

/**
 * True peak ceiling and loudness range. -2 dBTP rather than the -1/-1.5 often
 * quoted for masters: the export is AAC, and lossy encoding overshoots the
 * limiter a little (measured: loudnorm at -1.5 came out at -1.1 dBTP after
 * AAC encoding), so this leaves room to still land under -1 dBTP.
 */
const TRUE_PEAK_DB = -2;
const LOUDNESS_RANGE = 11;

const LOUDNESS_LUFS: Record<Exclude<LoudnessTarget, "off">, number> = {
  "-16": -16,
  "-14": -14,
};

/** loudnorm resamples internally to 192kHz -- bring it back to a normal delivery rate. */
const OUTPUT_SAMPLE_RATE = 48000;

/** Filters that run before loudnorm, in chain order. Empty when all are off. */
function preLoudnessFilters(settings: AudioSettings): string[] {
  const filters: string[] = [];
  if (settings.highpass) filters.push(HIGHPASS_FILTER);
  if (settings.denoise !== "off") filters.push(DENOISE_FILTERS[settings.denoise]);
  if (settings.levelSpeakers) filters.push(LEVEL_SPEAKERS_FILTER);
  return filters;
}

function loudnormBase(target: Exclude<LoudnessTarget, "off">): string {
  return `loudnorm=I=${LOUDNESS_LUFS[target]}:TP=${TRUE_PEAK_DB}:LRA=${LOUDNESS_RANGE}`;
}

/** Largest gain the measured path will apply either way -- beyond this the input is broken, not quiet. */
const MAX_GAIN_DB = 30;

export function loudnessTargetLufs(settings: AudioSettings): number | null {
  return settings.loudnessTarget === "off" ? null : LOUDNESS_LUFS[settings.loudnessTarget];
}

export function clampGainDb(gainDb: number): number {
  return Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
}

/** Gain in dB to move `measuredLufs` to `targetLufs`, clamped to a sane range. */
export function gainToTarget(targetLufs: number, measuredLufs: number): number {
  return clampGainDb(targetLufs - measuredLufs);
}

/**
 * The full audio filter chain for the export, or null when every option is
 * off (the render then maps the edited audio straight through, exactly as
 * before these settings existed).
 *
 * With a measured gain, loudness is set by that exact gain followed by a
 * peak limiter at the true-peak ceiling. loudnorm's own linear mode can't
 * be used for this: speech is peaky, so the gain needed to reach the target
 * usually pushes peaks past the ceiling, and loudnorm then silently falls
 * back to its dynamic mode, which undershoots -- measured on a test clip:
 * -16.3 LUFS when asked for -14. The gain itself comes from measuring and
 * correcting (see render-job.ts#resolveLoudnessGain), since the limiter
 * lowers integrated loudness a little too.
 *
 * Without a gain (measuring failed, or the audio is silent), it falls back to
 * single-pass loudnorm, which still lands near the target.
 */
export function buildAudioFilterChain(settings: AudioSettings, gainDb?: number): string | null {
  const filters = preLoudnessFilters(settings);
  if (settings.loudnessTarget !== "off") {
    if (gainDb !== undefined && Number.isFinite(gainDb)) {
      const clampedGain = clampGainDb(gainDb);
      const limit = Math.pow(10, TRUE_PEAK_DB / 20);
      // level=0: alimiter otherwise auto-normalizes its output up to the
      // limit, which would undo the precise gain above.
      filters.push(
        `volume=${clampedGain.toFixed(2)}dB`,
        `alimiter=limit=${limit.toFixed(4)}:attack=5:release=50:level=0`
      );
    } else {
      filters.push(loudnormBase(settings.loudnessTarget), `aresample=${OUTPUT_SAMPLE_RATE}`);
    }
  }
  return filters.length > 0 ? filters.join(",") : null;
}

/**
 * A measure-only chain: the audio as it would sound with `gainDb` applied
 * (or before any loudness stage, when no gain is given yet), followed by
 * loudnorm purely as a meter printing JSON. Null when no loudness target is
 * set.
 */
export function buildLoudnessAnalysisChain(settings: AudioSettings, gainDb?: number): string | null {
  if (settings.loudnessTarget === "off") return null;
  const stages =
    gainDb === undefined ? preLoudnessFilters(settings) : [buildAudioFilterChain(settings, gainDb)!];
  return [...stages, `${loudnormBase(settings.loudnessTarget)}:print_format=json`].join(",");
}

/**
 * Pulls the integrated loudness (input_i, in LUFS) out of loudnorm's JSON on
 * ffmpeg's stderr. Null when it's missing, unparseable, or not a sane finite
 * number (loudnorm reports "-inf" for silent input) -- callers then fall
 * back to single-pass loudnorm.
 */
export function parseMeasuredLoudness(stderr: string): number | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
    if (!/^-?\d+(\.\d+)?$/.test(raw.input_i ?? "")) return null;
    const lufs = Number(raw.input_i);
    return Number.isFinite(lufs) && lufs > -100 && lufs < 10 ? lufs : null;
  } catch {
    return null;
  }
}
