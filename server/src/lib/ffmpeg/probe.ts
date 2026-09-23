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
export function probeVideoDimensions(inputPath: string): Promise<{ width: number; height: number }> {
  const binary = process.env.FFPROBE_PATH || "ffprobe";
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
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
        const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[] };
        const stream = parsed.streams?.[0];
        if (!stream?.width || !stream?.height) {
          reject(new Error(`ffprobe returned no video stream dimensions for ${inputPath}.`));
          return;
        }
        resolve({ width: stream.width, height: stream.height });
      } catch {
        reject(new Error(`Could not parse ffprobe output for ${inputPath}.`));
      }
    });
  });
}
