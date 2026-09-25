import { describe, expect, it } from "vitest";
import { cleanSceneTitle, minSceneSeconds, scenesFromPicks } from "@/lib/scenes/suggest";
import { buildShotDetectionArgs, parseShotTimes } from "@/lib/ffmpeg/shots";
import type { EditedSentence } from "@/lib/publishing/edited-transcript";

/** One sentence every 20s: words at [t, t+1] and [t+1.2, t+3]. */
const sentences: EditedSentence[] = Array.from({ length: 10 }, (_, i) => ({
  sourceStart: i * 20,
  sourceEnd: i * 20 + 3,
  start: i * 20,
  end: i * 20 + 3,
  text: `Sentence number ${i} about something.`,
}));
const words = sentences.flatMap((s) => [
  { start: s.sourceStart, end: s.sourceStart + 1 },
  { start: s.sourceStart + 1.2, end: s.sourceStart + 3 },
]);

describe("scenesFromPicks", () => {
  it("names the first scene and places later boundaries in the silence before their sentence", () => {
    const out = scenesFromPicks(
      [
        { sentenceIndex: 0, title: "Welcome" },
        { sentenceIndex: 4, title: "Gear" },
      ],
      sentences,
      words,
      [],
      30
    );
    expect(out).toEqual([
      { at: 0, title: "Welcome", excerpt: "Sentence number 0 about something.", onShot: false },
      // Previous word ends at 63, sentence starts at 80.
      { at: 71.5, title: "Gear", excerpt: "Sentence number 4 about something.", onShot: false },
    ]);
  });

  it("uses a first pick near the start as the opening scene's name", () => {
    const out = scenesFromPicks(
      [
        { sentenceIndex: 1, title: "Welcome" },
        { sentenceIndex: 4, title: "Gear" },
      ],
      sentences,
      words,
      [],
      30
    );
    expect(out.map((s) => [s.at, s.title])).toEqual([
      [0, "Welcome"],
      [71.5, "Gear"],
    ]);
  });

  it("adds an Intro when the model skips the opening, and drops scenes too close together", () => {
    const out = scenesFromPicks(
      [
        { sentenceIndex: 2, title: "A" },
        { sentenceIndex: 3, title: "Too soon" },
        { sentenceIndex: 5, title: "B" },
      ],
      sentences,
      words,
      [],
      30
    );
    expect(out.map((s) => s.title)).toEqual(["Intro", "A", "B"]);
  });

  it("moves a boundary onto a nearby shot change, but never into a word", () => {
    const onShot = scenesFromPicks([{ sentenceIndex: 4, title: "Gear" }], sentences, words, [70.6], 30);
    expect(onShot[1]).toMatchObject({ at: 70.6, onShot: true });
    const inWord = scenesFromPicks([{ sentenceIndex: 4, title: "Gear" }], sentences, words, [80.5], 30);
    expect(inWord[1]).toMatchObject({ at: 71.5, onShot: false });
    const tooFar = scenesFromPicks([{ sentenceIndex: 4, title: "Gear" }], sentences, words, [75], 30);
    expect(tooFar[1].onShot).toBe(false);
  });

  it("ignores out-of-range indices and empty titles", () => {
    const out = scenesFromPicks(
      [
        { sentenceIndex: 99, title: "Nope" },
        { sentenceIndex: -1, title: "Nope" },
        { sentenceIndex: 4, title: "   " },
      ],
      sentences,
      words,
      [],
      30
    );
    expect(out).toEqual([]);
  });
});

describe("cleanSceneTitle", () => {
  it("strips characters card text can't hold and caps the length", () => {
    expect(cleanSceneTitle("  Pricing {\\fs99}\n talk ")).toBe("Pricing fs99 talk");
    expect(cleanSceneTitle("x".repeat(80))).toHaveLength(60);
  });
});

describe("minSceneSeconds", () => {
  it("is 45s for an episode, less for a short video", () => {
    expect(minSceneSeconds(3600)).toBe(45);
    expect(minSceneSeconds(120)).toBe(20);
    expect(minSceneSeconds(30)).toBe(10);
  });
});

describe("shot detection", () => {
  it("scores frames at low resolution and prints only the cuts", () => {
    expect(buildShotDetectionArgs("/data/proxy.mp4")).toContain("scale=320:-2,select='gt(scene,0.35)',showinfo");
  });

  it("parses showinfo times, merging near-duplicates and dropping the very ends", () => {
    const stderr = [
      "[Parsed_showinfo_2 @ 0x1] n:   0 pts:   12 pts_time:0.4 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  300 pts_time:12.012 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   2 pts:  310 pts_time:12.4 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   3 pts:  900 pts_time:36.5 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   4 pts:  999 pts_time:59.6 duration: 1",
    ].join("\n");
    expect(parseShotTimes(stderr, 60)).toEqual([12.012, 36.5]);
  });
});
