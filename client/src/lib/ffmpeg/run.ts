import { execFile } from "node:child_process";

export class FfmpegNotFoundError extends Error {
  constructor() {
    super(
      "ffmpeg was not found on this machine. Install it and make sure it's on PATH -- see https://ffmpeg.org/download.html."
    );
    this.name = "FfmpegNotFoundError";
  }
}

/**
 * Runs ffmpeg with the given argv via execFile -- never a shell string, so
 * there's no command-injection surface no matter what ends up in `args`
 * (spec section 18). Rejects with the captured stderr tail on a non-zero
 * exit so callers can surface a useful error.
 *
 * The binary defaults to `ffmpeg` on PATH, but can be overridden with
 * FFMPEG_PATH -- useful on platforms (e.g. Homebrew) where the default
 * ffmpeg build lacks libass and can't burn in captions, but a full build
 * (e.g. `ffmpeg-full`) is installed alongside it.
 */
export function runFfmpeg(args: string[]): Promise<void> {
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve, reject) => {
    // turbopackIgnore: binary is an external system executable (resolved via
    // PATH or FFMPEG_PATH), never a project file -- it must not be traced.
    execFile(/* turbopackIgnore: true */ binary, args, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new FfmpegNotFoundError());
        return;
      }
      const tail = stderr.trim().split("\n").slice(-20).join("\n");
      reject(new Error(`ffmpeg exited with an error:\n${tail}`));
    });
  });
}
