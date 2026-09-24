import { describe, expect, it } from "vitest";
import { splitCuesForShorts } from "@/lib/captions/generate";
import { toAssKaraoke } from "@/lib/captions/format";
import { DEFAULT_CAPTION_STYLE } from "@/lib/captions/style";

const cue = (words: string[]) => ({
  start: 0,
  end: words.length,
  text: words.join(" "),
  words: words.map((text, i) => ({ text, start: i, end: i + 0.8 })),
});

describe("splitCuesForShorts", () => {
  it("leaves short cues alone", () => {
    const c = cue(["one", "two", "three"]);
    expect(splitCuesForShorts([c])).toEqual([c]);
  });

  it("splits into even groups that hold until the next group starts", () => {
    const parts = splitCuesForShorts([cue(["a", "b", "c", "d", "e", "f", "g"])]);
    expect(parts.map((p) => p.text)).toEqual(["a b c d", "e f g"]);
    expect(parts.map((p) => [p.start, p.end])).toEqual([
      [0, 4],
      [4, 7],
    ]);
  });
});

describe("toAssKaraoke frame", () => {
  it("defaults to the 1920x1080 reference with the usual margins", () => {
    const ass = toAssKaraoke([cue(["hi"])], DEFAULT_CAPTION_STYLE);
    expect(ass).toContain("PlayResX: 1920\nPlayResY: 1080");
    expect(ass).toMatch(/,10,10,32,1\n/);
  });

  it("lays out for a vertical frame with Shorts margins, sizing the font from its height", () => {
    const ass = toAssKaraoke([cue(["hi"])], { ...DEFAULT_CAPTION_STYLE, fontSize: 4.2 }, {
      width: 1080,
      height: 1920,
      marginVPercent: 18,
      marginHPercent: 7,
    });
    expect(ass).toContain("PlayResX: 1080\nPlayResY: 1920");
    expect(ass).toContain(",81,"); // 4.2% of 1920
    expect(ass).toMatch(/,76,76,346,1\n/);
  });
});
