import { execFile } from "node:child_process";

export class FfprobeNotFoundError extends Error {
  constructor() {
    super(
      "ffprobe was not found on this machine. It ships with ffmpeg -- make sure it's on PATH -- see https://ffmpeg.org/download.html."
    );
    this.name = "FfprobeNotFoundError";
  }
}

/**
 * Reads a video's pixel width/height via ffprobe, for sizing overlays (e.g.
 * the logo watermark) relative to the frame at export time the same way the
 * live preview sizes them relative to the rendered <video> element via CSS.
 *
 * The binary defaults to `ffprobe` on PATH, overridable with FFPROBE_PATH --
 * mirrors FFMPEG_PATH in ffmpeg/run.ts.
 */
export async function probeVideoDimensions(inputPath: string): Promise<{ width: number; height: number }> {
  const { width, height } = await probeVideoStream(inputPath);
  return { width, height };
}

/**
 * Width, height and frame rate of the first video stream. The rate is
 * ffprobe's r_frame_rate as a rational string ("30000/1001"), passed to
 * ffmpeg as-is so every segment of a render runs at exactly the source's
 * rate (lib/ffmpeg/plan.ts).
 */
export function probeVideoStream(inputPath: string): Promise<{ width: number; height: number; fps: string }> {
  const binary = process.env.FFPROBE_PATH || "ffprobe";
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate",
    "-of",
    "json",
    inputPath,
  ];
  return new Promise((resolve, reject) => {
    // turbopackIgnore: binary is an external system executable (resolved via
    // PATH or FFPROBE_PATH), never a project file -- it must not be traced.
    execFile(/* turbopackIgnore: true */ binary, args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new FfprobeNotFoundError());
          return;
        }
        const tail = stderr.trim().split("\n").slice(-20).join("\n");
        reject(new Error(`ffprobe exited with an error:\n${tail}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {
          streams?: { width?: number; height?: number; r_frame_rate?: string }[];
        };
        const stream = parsed.streams?.[0];
        if (!stream?.width || !stream?.height) {
          reject(new Error(`ffprobe returned no video stream dimensions for ${inputPath}.`));
          return;
        }
        resolve({ width: stream.width, height: stream.height, fps: normalizeFrameRate(stream.r_frame_rate) });
      } catch {
        reject(new Error(`Could not parse ffprobe output for ${inputPath}.`));
      }
    });
  });
}

/** A usable "num/den" rate, or 30 when ffprobe reports none (or 0/0, as it does for some still images). */
export function normalizeFrameRate(rate: string | undefined): string {
  const match = rate?.match(/^(\d{1,6})\/(\d{1,6})$/);
  if (!match || Number(match[1]) === 0 || Number(match[2]) === 0) return "30";
  const fps = Number(match[1]) / Number(match[2]);
  return fps > 0 && fps <= 240 ? `${match[1]}/${match[2]}` : "30";
}

/**
 * Reads a media file's container duration in seconds via ffprobe -- used to
 * plan transcription chunks over the extracted audio track.
 */
export function probeDuration(inputPath: string): Promise<number> {
  const binary = process.env.FFPROBE_PATH || "ffprobe";
  const args = ["-v", "error", "-show_entries", "format=duration", "-of", "json", inputPath];
  return new Promise((resolve, reject) => {
    execFile(/* turbopackIgnore: true */ binary, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new FfprobeNotFoundError());
          return;
        }
        const tail = stderr.trim().split("\n").slice(-20).join("\n");
        reject(new Error(`ffprobe exited with an error:\n${tail}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
        const duration = Number(parsed.format?.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error(`ffprobe returned no duration for ${inputPath}.`));
          return;
        }
        resolve(duration);
      } catch {
        reject(new Error(`Could not parse ffprobe output for ${inputPath}.`));
      }
    });
  });
}
