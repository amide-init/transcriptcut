import { describe, expect, it } from "vitest";
import { buildAudioOnlyRenderArgs, buildLoudnessAnalysisArgs, buildRenderArgs } from "@/lib/ffmpeg/plan";
import { DEFAULT_CAPTION_STYLE } from "@/lib/captions/style";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";

const baseArgs = {
  inputPath: "/data/in.mp4",
  outputPath: "/data/out.mp4",
  playableRanges: [{ start: 0, end: 10 }],
  filterId: "none",
  frameRate: "30000/1001",
};

describe("buildRenderArgs: validation", () => {
  it("rejects a frame rate that isn't a plain number or ratio", () => {
    expect(() => buildRenderArgs({ ...baseArgs, frameRate: "30,drawtext=x" })).toThrow(/Invalid frame rate/);
  });

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
    expect(filterComplex).toContain("[0:v]trim=start=0.000:end=10.000,setpts=PTS-STARTPTS,fps=30000/1001[v0]");
    expect(filterComplex).toContain("[0:a]atrim=start=0.000:end=10.000,asetpts=PTS-STARTPTS[a0]");
    expect(filterComplex).toContain("[v0]null[outv]");
    expect(filterComplex).toContain("[a0]anull[outa]");
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
    expect(filterComplex).toContain("[0:v]trim=start=0.000:end=3.000,setpts=PTS-STARTPTS,fps=30000/1001[v0]");
    expect(filterComplex).toContain("[0:v]trim=start=5.000:end=8.000,setpts=PTS-STARTPTS,fps=30000/1001[v1]");
    // Both 3s segments comfortably fit the default 0.03s crossfade: offset
    // is the first segment's own length (3.0) minus that 0.03s.
    expect(filterComplex).toContain("[v0][v1]xfade=transition=fade:duration=0.030:offset=2.970[outv]");
    expect(filterComplex).toContain("[a0][a1]acrossfade=d=0.030[outa]");
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
    // First join: offset 3.0-0.03=2.97, combined length becomes 3+3-0.03=5.97.
    expect(filterComplex).toContain("[v0][v1]xfade=transition=fade:duration=0.030:offset=2.970[vx1]");
    expect(filterComplex).toContain("[a0][a1]acrossfade=d=0.030[ax1]");
    // Second join starts from that combined 5.97s stream: offset=5.97-0.03=5.94.
    expect(filterComplex).toContain("[vx1][v2]xfade=transition=fade:duration=0.030:offset=5.940[outv]");
    expect(filterComplex).toContain("[ax1][a2]acrossfade=d=0.030[outa]");
  });

  it("clamps the crossfade well below the default when a segment is very short", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      playableRanges: [
        { start: 0, end: 0.02 },
        { start: 1, end: 6 },
      ],
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    // First segment is 0.02s -- half of it (0.01) is below the 0.03s
    // default, so the crossfade shrinks to 0.01 instead of overrunning it.
    expect(filterComplex).toContain("duration=0.010:offset=0.010");
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

describe("buildRenderArgs: audio cleanup", () => {
  it("maps the edited audio straight through when no audio filter is set", () => {
    const argv = buildRenderArgs(baseArgs);
    expect(argv[argv.indexOf("[outv]") + 2]).toBe("[outa]");
    expect(argv.join(" ")).not.toContain("[cleana]");
  });

  it("applies the audio filter after the cuts and maps the cleaned stream", () => {
    const argv = buildRenderArgs({ ...baseArgs, audioFilter: "highpass=f=80" });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).toContain("[outa]highpass=f=80[cleana]");
    expect(argv).toEqual(expect.arrayContaining(["-map", "[cleana]"]));
    expect(argv).not.toContain("[outa]");
  });
});

describe("buildLoudnessAnalysisArgs", () => {
  it("measures the edited audio only, with the same crossfades as the export, writing nothing", () => {
    const playableRanges = [
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ];
    const argv = buildLoudnessAnalysisArgs({
      inputPath: "/data/in.mp4",
      playableRanges,
      analysisChain: "loudnorm=I=-16:print_format=json",
    });
    const filterComplex = argv[argv.indexOf("-filter_complex") + 1];
    expect(filterComplex).not.toContain("[0:v]");
    expect(filterComplex).toContain("[a0][a1]acrossfade=d=0.030[outa]");
    expect(filterComplex).toContain("[outa]loudnorm=I=-16:print_format=json[analysis]");
    expect(argv.slice(-3)).toEqual(["-f", "null", "-"]);

    const exportComplex = buildRenderArgs({ ...baseArgs, playableRanges });
    expect(exportComplex[exportComplex.indexOf("-filter_complex") + 1]).toContain("[a0][a1]acrossfade=d=0.030[outa]");
  });

  it("rejects invalid ranges like the export does", () => {
    expect(() =>
      buildLoudnessAnalysisArgs({ inputPath: "/in.mp4", playableRanges: [], analysisChain: "loudnorm" })
    ).toThrow(/entire video has been cut/);
  });
});

describe("chapter metadata", () => {
  it("adds the metadata file as the input after the source and maps its metadata and chapters", () => {
    const argv = buildRenderArgs({ ...baseArgs, metadataPath: "/data/meta.ffmeta" });
    expect(argv.slice(0, 5)).toEqual(["-y", "-i", "/data/in.mp4", "-i", "/data/meta.ffmeta"]);
    expect(argv.join(" ")).toContain("-map_metadata 1 -map_chapters 1");
  });

  it("indexes the metadata input after the logo when there is one", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      logoPath: "/data/logo.png",
      logoPosition: "bottom-right",
      videoWidth: 1920,
      videoHeight: 1080,
      metadataPath: "/data/meta.ffmeta",
    });
    expect(argv.slice(1, 7)).toEqual(["-i", "/data/in.mp4", "-i", "/data/logo.png", "-i", "/data/meta.ffmeta"]);
    expect(argv.join(" ")).toContain("-map_metadata 2 -map_chapters 2");
  });

  it("leaves metadata mapping out entirely when there's no file", () => {
    expect(buildRenderArgs(baseArgs)).not.toContain("-map_chapters");
  });
});

describe("buildAudioOnlyRenderArgs", () => {
  const audio = { inputPath: "/in.mp4", outputPath: "/out", playableRanges: [{ start: 0, end: 10 }] };

  it("encodes MP3 with ID3v2.3 and embeds chapters", () => {
    const argv = buildAudioOnlyRenderArgs({ ...audio, format: "mp3", metadataPath: "/m.ffmeta" });
    expect(argv.join(" ")).toContain("-c:a libmp3lame -b:a 192k -ar 44100 -id3v2_version 3");
    expect(argv.join(" ")).toContain("-map_metadata 1 -map_chapters 1");
    expect(argv.join(" ")).not.toContain("[0:v]");
  });

  it("writes WAV as 16-bit PCM and skips chapters, which WAV can't hold", () => {
    const argv = buildAudioOnlyRenderArgs({ ...audio, format: "wav", metadataPath: "/m.ffmeta" });
    expect(argv.join(" ")).toContain("-c:a pcm_s16le");
    expect(argv).not.toContain("/m.ffmeta");
  });

  it("defaults to AAC in m4a for previews", () => {
    expect(buildAudioOnlyRenderArgs(audio).join(" ")).toContain("-c:a aac -b:a 160k");
  });
});

describe("reframe", () => {
  it("crops to the target aspect at cropX, then scales, before captions and logo", () => {
    const argv = buildRenderArgs({
      ...baseArgs,
      srtPath: "/data/c.ass",
      logoPath: "/data/logo.png",
      logoPosition: "top-right",
      videoWidth: 1080,
      videoHeight: 1920,
      reframe: { width: 1080, height: 1920, cropX: 0.25 },
    });
    const graph = argv[argv.indexOf("-filter_complex") + 1];
    expect(graph).toContain(
      "[outv]crop=w='trunc((if(gt(iw/ih,0.562500),ih*0.562500,iw))/2)*2':h='trunc((if(gt(iw/ih,0.562500),ih,iw/0.562500))/2)*2':x='(iw-ow)*0.2500':y='(ih-oh)/2',scale=1080:1920,setsar=1[reframed]"
    );
    expect(graph.indexOf("[reframed]subtitles")).toBeGreaterThan(-1);
    expect(graph.indexOf("[captioned][logosrc]overlay")).toBeGreaterThan(-1);
  });

  it("clamps cropX and rejects nonsense sizes", () => {
    const argv = buildRenderArgs({ ...baseArgs, reframe: { width: 1080, height: 1080, cropX: 7 } });
    expect(argv[argv.indexOf("-filter_complex") + 1]).toContain("x='(iw-ow)*1.0000'");
    expect(() => buildRenderArgs({ ...baseArgs, reframe: { width: 0, height: 1920, cropX: 0.5 } })).toThrow(
      /Invalid reframe size/
    );
    expect(() => buildRenderArgs({ ...baseArgs, reframe: { width: 1080.5, height: 1920, cropX: 0.5 } })).toThrow();
  });
});
