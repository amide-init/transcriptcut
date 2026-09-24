/**
 * Deterministic ffmpeg argv builders for the transcription pipeline
 * (audio extraction, silence detection, chunk slicing) and the playback
 * proxy. Every builder returns an argv array for execFile -- never a shell
 * string -- and only ever interpolates app-controlled paths and numbers
 * (claude.md sections 6, 12, 18).
 */

/**
 * Mono, 16kHz, 32kbps MP3: roughly 14MB per hour of audio. Whisper resamples
 * to 16kHz internally anyway, so this loses nothing it would have used, and
 * it keeps even a 10-minute chunk far below Whisper's 25MB upload cap.
 */
const SPEECH_AUDIO_ARGS = ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k"];

/** Extracts the source's audio track as a small speech-quality MP3. */
export function buildExtractAudioArgs(inputPath: string, outputPath: string): string[] {
  return ["-y", "-i", inputPath, ...SPEECH_AUDIO_ARGS, outputPath];
}

/** Silences quieter than this, for at least SILENCE_MIN_SECONDS, are candidate chunk boundaries. */
const SILENCE_NOISE_DB = -35;
const SILENCE_MIN_SECONDS = 0.4;

/** Analysis-only pass: ffmpeg logs silence_start/silence_end lines to stderr, writes no output. */
export function buildSilenceDetectArgs(inputPath: string): string[] {
  return [
    "-i",
    inputPath,
    "-af",
    `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
    "-f",
    "null",
    "-",
  ];
}

export type SilenceSpan = { start: number; end: number };

/** Parses silencedetect's stderr log into [start, end] spans, in order. */
export function parseSilenceDetectOutput(stderr: string): SilenceSpan[] {
  const spans: SilenceSpan[] = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startMatch) {
      pendingStart = Math.max(0, Number(startMatch[1]));
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch && pendingStart !== null) {
      spans.push({ start: pendingStart, end: Number(endMatch[1]) });
      pendingStart = null;
    }
  }
  return spans;
}

/**
 * Slices [start, start + duration) out of the extracted audio into its own
 * file. Re-encodes rather than stream-copying so the cut lands exactly on
 * `start` (a stream copy snaps to the nearest MP3 frame), which keeps each
 * chunk's timestamp offset exact when the transcripts are merged.
 */
export function buildAudioChunkArgs(
  inputPath: string,
  outputPath: string,
  start: number,
  duration: number
): string[] {
  return [
    "-y",
    "-ss",
    start.toFixed(3),
    "-t",
    duration.toFixed(3),
    "-i",
    inputPath,
    ...SPEECH_AUDIO_ARGS,
    outputPath,
  ];
}

/** Proxy height (claude.md section 16). Sources at or below this, and small enough, skip the proxy. */
export const PROXY_HEIGHT = 720;
export const PROXY_MIN_SOURCE_BYTES = 300 * 1024 * 1024;

export function needsProxy(source: { height: number; sizeBytes: number }): boolean {
  return source.height > PROXY_HEIGHT || source.sizeBytes > PROXY_MIN_SOURCE_BYTES;
}

/**
 * 720p H.264 editing proxy. A short GOP (-g 48) keeps seeks snappy in the
 * browser, and +faststart puts the moov atom first so playback can begin
 * before the whole file has been range-requested.
 */
export function buildProxyArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=-2:${PROXY_HEIGHT}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-g",
    "48",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
