import { describe, expect, it } from "vitest";
import {
  buildAudioFilterChain,
  buildLoudnessAnalysisChain,
  gainToTarget,
  parseMeasuredLoudness,
} from "@/lib/ffmpeg/audio-filters";
import { DEFAULT_AUDIO_SETTINGS, PODCAST_AUDIO_PRESET } from "@/types/audio-settings";

describe("buildAudioFilterChain", () => {
  it("returns null when everything is off, so exports are unchanged by default", () => {
    expect(buildAudioFilterChain(DEFAULT_AUDIO_SETTINGS)).toBeNull();
  });

  it("orders the podcast chain highpass -> denoise -> leveling -> loudnorm -> resample", () => {
    const chain = buildAudioFilterChain(PODCAST_AUDIO_PRESET)!;
    const names = chain.split(",").map((f) => f.split("=")[0]);
    expect(names).toEqual(["highpass", "afftdn", "dynaudnorm", "loudnorm", "aresample"]);
    const measured = buildAudioFilterChain(PODCAST_AUDIO_PRESET, 7.5)!;
    expect(measured.split(",").map((f) => f.split("=")[0])).toEqual([
      "highpass",
      "afftdn",
      "dynaudnorm",
      "volume",
      "alimiter",
    ]);
  });

  it("uses fixed constants per enum value", () => {
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, denoise: "light" })).toBe("afftdn=nr=10:nf=-50:tn=1");
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, denoise: "strong" })).toBe("afftdn=nr=20:nf=-40:tn=1");
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, loudnessTarget: "-14" })).toBe(
      "loudnorm=I=-14:TP=-2:LRA=11,aresample=48000"
    );
  });

  it("applies the measured gain then a true-peak limiter", () => {
    const chain = buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, loudnessTarget: "-16" }, 7.456)!;
    expect(chain).toBe("volume=7.46dB,alimiter=limit=0.7943:attack=5:release=50:level=0");
  });

  it("clamps an absurd gain", () => {
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, loudnessTarget: "-14" }, 400)!).toMatch(/^volume=30\.00dB,/);
    expect(gainToTarget(-14, -120)).toBe(30);
    expect(gainToTarget(-16, -23.5)).toBe(7.5);
  });

  it("ignores a gain when loudness is off", () => {
    expect(buildAudioFilterChain({ ...DEFAULT_AUDIO_SETTINGS, highpass: true }, 6)).toBe("highpass=f=80");
  });
});

describe("buildLoudnessAnalysisChain", () => {
  it("is null without a loudness target", () => {
    expect(buildLoudnessAnalysisChain({ ...PODCAST_AUDIO_PRESET, loudnessTarget: "off" })).toBeNull();
  });

  it("with a gain, meters the full chain including gain and limiter", () => {
    expect(buildLoudnessAnalysisChain({ ...DEFAULT_AUDIO_SETTINGS, loudnessTarget: "-16" }, 3)).toBe(
      "volume=3.00dB,alimiter=limit=0.7943:attack=5:release=50:level=0,loudnorm=I=-16:TP=-2:LRA=11:print_format=json"
    );
  });

  it("runs the pre-loudness filters, then loudnorm in JSON measure mode", () => {
    expect(buildLoudnessAnalysisChain(PODCAST_AUDIO_PRESET)).toBe(
      "highpass=f=80,afftdn=nr=10:nf=-50:tn=1,dynaudnorm=f=250:g=15:p=0.9:m=8,loudnorm=I=-16:TP=-2:LRA=11:print_format=json"
    );
  });
});

describe("parseMeasuredLoudness", () => {
  const stderr = `size=N/A time=00:10:00.00 bitrate=N/A speed= 120x
[Parsed_loudnorm_3 @ 0x600] 
{
	"input_i" : "-23.46",
	"input_tp" : "-4.10",
	"input_lra" : "7.20",
	"input_thresh" : "-33.90",
	"output_i" : "-16.01",
	"output_tp" : "-1.50",
	"output_lra" : "6.10",
	"output_thresh" : "-26.40",
	"normalization_type" : "dynamic",
	"target_offset" : "0.35"
}`;

  it("reads integrated loudness from the JSON block at the end of stderr", () => {
    expect(parseMeasuredLoudness(stderr)).toBe(-23.46);
  });

  it("returns null for silent input (-inf)", () => {
    expect(parseMeasuredLoudness(stderr.replace('"-23.46"', '"-inf"'))).toBeNull();
  });

  it("returns null when there's no JSON", () => {
    expect(parseMeasuredLoudness("ffmpeg version 7.1")).toBeNull();
  });

  it("returns null for a value that isn't a plain number", () => {
    expect(parseMeasuredLoudness(stderr.replace('"-23.46"', '"-23.46:af=evil"'))).toBeNull();
  });
});
