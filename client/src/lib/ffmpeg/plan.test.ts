import { describe, expect, it } from "vitest";
import { buildRenderArgs } from "@/lib/ffmpeg/plan";
import { DEFAULT_CAPTION_STYLE } from "@/lib/captions/style";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";

const baseArgs = {
  inputPath: "/data/in.mp4",
  outputPath: "/data/out.mp4",
  playableRanges: [{ start: 0, end: 10 }],
  filterId: "none",
};

describe("buildRenderArgs: validation", () => {
  it("throws when the entire video has been cut (no playable ranges)", () => {
    expect(() => buildRenderArgs({ ...baseArgs, playableRanges: [] })).toThrow(/entire video has been cut/);
  });

  it.each([
    { start: -1, end: 5 },
    { start: 5, end: 5 },
    { start: 5, end: 4 },
    { start: NaN, end: 5 },
    { start: 0, end: Infinity },
  ])("throws for an invalid range %o", (range) => {
    expect(() => buildRenderArgs({ ...baseArgs, playableRanges: [range] })).toThrow(/Invalid playable range/);
  });

  it("throws when captions are requested without a known video height", () => {
    expect(() =>
      buildRenderArgs({ ...baseArgs, srtPath: "/data/subs.srt", captionStyle: DEFAULT_CAPTION_STYLE })
    ).toThrow(/dimensions are unknown/);
  });

  it("throws when a logo is requested without known video dimensions", () => {
    expect(() =>
      buildRenderArgs({ ...baseArgs, logoPath: "/data/logo.png", logoPosition: "bottom-right" })
    ).toThrow(/dimensions are unknown/);
  });
});

describe("buildRenderArgs: basic structure", () => {
  it("builds -i/-filter_complex/-map/output for a single playable range", () => {
    const argv = buildRenderArgs(baseArgs);
    expect(argv[0]).toBe("-y");
    expect(argv).toEqual(
      expect.arrayContaining(["-i", "/data/in.mp4", "-filter_complex", expect.any(String), "-map", "[outv]", "-map", "[outa]"])
    );
    expect(argv[argv.length - 1]).toBe("/data/out.mp4");
    expect(argv).toEqual(expect.arrayContaining(["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"]));
  });

  it("trims a single range and maps it straight to [outv]/[outa]", () => {
    const argv = buildRenderArgs(baseArgs);
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("[0:v]trim=start=0.000:end=10.000,setpts=PTS-STARTPTS[v0]");
    expect(filterComplex).toContain("[0:a]atrim=start=0.000:end=10.000,asetpts=PTS-STARTPTS[a0]");
    expect(filterComplex).toContain("[v0][a0]concat=n=1:v=1:a=1[outv][outa]");
  });

  it("trims multiple playable ranges and crossfades across the cut between them", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      playableRanges: [
        { start: 0, end: 3 },
        { start: 5, end: 8 },
      ],
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("[0:v]trim=start=0.000:end=3.000,setpts=PTS-STARTPTS[v0]");
    expect(filterComplex).toContain("[0:v]trim=start=5.000:end=8.000,setpts=PTS-STARTPTS[v1]");
    // Both 3s segments comfortably fit the default 0.2s crossfade: offset is
    // the first segment's own length (3.0) minus that 0.2s.
    expect(filterComplex).toContain("[v0][v1]xfade=transition=fade:duration=0.200:offset=2.800[outv]");
    expect(filterComplex).toContain("[a0][a1]acrossfade=d=0.200[outa]");
  });

  it("chains xfade/acrossfade across more than one cut, tracking cumulative offset", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      playableRanges: [
        { start: 0, end: 3 },
        { start: 5, end: 8 },
        { start: 10, end: 13 },
      ],
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    // First join: offset 3.0-0.2=2.8, combined length becomes 3+3-0.2=5.8.
    expect(filterComplex).toContain("[v0][v1]xfade=transition=fade:duration=0.200:offset=2.800[vx1]");
    expect(filterComplex).toContain("[a0][a1]acrossfade=d=0.200[ax1]");
    // Second join starts from that combined 5.8s stream: offset=5.8-0.2=5.6.
    expect(filterComplex).toContain("[vx1][v2]xfade=transition=fade:duration=0.200:offset=5.600[outv]");
    expect(filterComplex).toContain("[ax1][a2]acrossfade=d=0.200[outa]");
  });

  it("clamps the crossfade well below the default when a segment is very short", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      playableRanges: [
        { start: 0, end: 0.1 },
        { start: 1, end: 6 },
      ],
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    // First segment is 0.1s -- half of it (0.05) is below the 0.2s default,
    // so the crossfade shrinks to 0.05 instead of overrunning the segment.
    expect(filterComplex).toContain("duration=0.050:offset=0.050");
  });

  it("does not add a second -i or overlay when no logo is set", () => {
    const argv = buildRenderArgs(baseArgs);
    expect(argv.filter((a) => a === "-i")).toHaveLength(1);
    expect(argv.join(" ")).not.toContain("overlay=");
  });
});

describe("buildRenderArgs: color filter", () => {
  it("applies the preset filter alone when no manual properties are set", () => {
    const argv = buildRenderArgs({ ...baseArgs, filterId: "contrast" });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toMatch(/\[outv\]eq=saturation=1\.1,lut=r=.*\[filtered\]/);
    expect(argv).toContain("[filtered]");
  });

  it("combines preset and manual properties with a comma, and maps to [filtered]", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      filterId: "none",
      properties: { ...DEFAULT_VIDEO_PROPERTIES, saturation: 20 },
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("[outv]eq=saturation=1.200:contrast=1.000[filtered]");
    expect(argv).toContain("[filtered]");
  });

  it("skips the color-filter step entirely when nothing is active (stays mapped to [outv])", () => {
    const argv = buildRenderArgs({ ...baseArgs, filterId: "none", properties: DEFAULT_VIDEO_PROPERTIES });
    expect(argv).toContain("[outv]");
    expect(argv.join(" ")).not.toContain("[filtered]");
  });
});

describe("buildRenderArgs: captions", () => {
  it("adds a subtitles filter step with the escaped file path", () => {
    const argv = buildRenderArgs({ ...baseArgs, srtPath: "/data/subs.srt" });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("subtitles=filename='/data/subs.srt'[captioned]");
    expect(argv).toContain("[captioned]");
  });

  it("adds force_style (escaped) when a captionStyle + video height are given", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      srtPath: "/data/subs.srt",
      captionStyle: DEFAULT_CAPTION_STYLE,
      videoHeight: 1080,
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain(":force_style='");
    expect(filterComplex).toContain("FontName=Arial");
  });

  it("escapes a Windows-style path (colon, backslashes) for the subtitles filename", () => {
    const argv = buildRenderArgs({ ...baseArgs, srtPath: "C:\\data\\subs.srt" });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("filename='C\\:/data/subs.srt'");
  });
});

describe("buildRenderArgs: logo overlay", () => {
  const logoArgs = {
    ...baseArgs,
    logoPath: "/data/logo.png",
    logoPosition: "bottom-right" as const,
    logoPaddingX: 3,
    logoPaddingY: 4,
    logoOpacity: 51,
    videoWidth: 1920,
    videoHeight: 1080,
  };

  it("adds the logo as a second -i input", () => {
    const argv = buildRenderArgs(logoArgs);
    const iIndices = argv.reduce<number[]>((acc, a, i) => (a === "-i" ? [...acc, i] : acc), []);
    expect(iIndices).toHaveLength(2);
    expect(argv[iIndices[1] + 1]).toBe("/data/logo.png");
  });

  it("scales the logo to LOGO_MAX_WIDTH/HEIGHT_FRACTION of the real probed video size", () => {
    const argv = buildRenderArgs(logoArgs);
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    // 1920 * 0.25 = 480, 1080 * 0.15 = 162 (LOGO_MAX_WIDTH/HEIGHT_FRACTION).
    expect(filterComplex).toContain("min(1,min(480/iw,162/ih))");
  });

  it("premultiplies alpha by the opacity fraction instead of using a native overlay opacity option", () => {
    const argv = buildRenderArgs(logoArgs);
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("colorchannelmixer=aa=0.510");
  });

  it("positions bottom-right using frame-relative W/H expressions", () => {
    const argv = buildRenderArgs(logoArgs);
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("overlay=x=(W-w-W*0.0300):y=(H-h-H*0.0400)");
  });

  it("maps the final output to [logoed], overlaid after color grading and captions", () => {
    const argv = buildRenderArgs({
      ...logoArgs,
      filterId: "contrast",
      srtPath: "/data/subs.srt",
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(argv).toContain("[logoed]");
    expect(filterComplex).toMatch(/\[captioned\]\[logosrc\]overlay=.*\[logoed\]/);
  });
});
