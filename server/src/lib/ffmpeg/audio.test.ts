import { describe, expect, it } from "vitest";
import { buildAudioChunkArgs, buildProxyArgs, needsProxy, parseSilenceDetectOutput } from "@/lib/ffmpeg/audio";

describe("parseSilenceDetectOutput", () => {
  it("pairs silence_start/silence_end lines into spans", () => {
    const stderr = [
      "Input #0, mp3, from 'speech.mp3':",
      "[silencedetect @ 0x1] silence_start: 12.5",
      "[silencedetect @ 0x1] silence_end: 13.25 | silence_duration: 0.75",
      "size=N/A time=00:01:00.00",
      "[silencedetect @ 0x1] silence_start: -0.01",
      "[silencedetect @ 0x1] silence_end: 0.6 | silence_duration: 0.61",
    ].join("\n");
    expect(parseSilenceDetectOutput(stderr)).toEqual([
      { start: 12.5, end: 13.25 },
      { start: 0, end: 0.6 },
    ]);
  });

  it("drops a trailing silence_start with no matching end", () => {
    expect(parseSilenceDetectOutput("[silencedetect @ 0x1] silence_start: 50")).toEqual([]);
  });
});

describe("buildAudioChunkArgs", () => {
  it("seeks before the input and re-encodes to the speech format", () => {
    const args = buildAudioChunkArgs("/in.mp3", "/out.mp3", 600.5, 598.25);
    expect(args.slice(0, 7)).toEqual(["-y", "-ss", "600.500", "-t", "598.250", "-i", "/in.mp3"]);
    expect(args).toContain("libmp3lame");
    expect(args[args.length - 1]).toBe("/out.mp3");
  });
});

describe("proxy", () => {
  it("is only needed for sources above 720p or large files", () => {
    expect(needsProxy({ height: 720, sizeBytes: 50 * 1024 * 1024 })).toBe(false);
    expect(needsProxy({ height: 1080, sizeBytes: 50 * 1024 * 1024 })).toBe(true);
    expect(needsProxy({ height: 720, sizeBytes: 2 * 1024 * 1024 * 1024 })).toBe(true);
  });

  it("scales to 720p with an even width", () => {
    const args = buildProxyArgs("/in.mov", "/out.mp4");
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=-2:720");
  });
});
