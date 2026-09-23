import { describe, expect, it } from "vitest";
import { toAssKaraoke, toSrt, toVtt } from "@/lib/captions/format";
import { DEFAULT_CAPTION_STYLE } from "@/lib/captions/style";
import type { CaptionCue } from "@/lib/captions/generate";

const cues: CaptionCue[] = [
  {
    start: 0,
    end: 1.5,
    text: "Hello world",
    words: [
      { start: 0, end: 0.5, text: "Hello" },
      { start: 0.5, end: 1.5, text: "world" },
    ],
  },
  {
    start: 62.25,
    end: 63,
    text: "Second cue",
    words: [
      { start: 62.25, end: 62.6, text: "Second" },
      { start: 62.6, end: 63, text: "cue" },
    ],
  },
];

describe("toSrt", () => {
  it("numbers cues sequentially with HH:MM:SS,mmm timestamps", () => {
    const srt = toSrt(cues);
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHello world\n\n2\n00:01:02,250 --> 00:01:03,000\nSecond cue"
    );
  });

  it("returns an empty string for no cues", () => {
    expect(toSrt([])).toBe("");
  });
});

describe("toVtt", () => {
  it("starts with the WEBVTT header and uses dot decimal separators", () => {
    const vtt = toVtt(cues);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
    expect(vtt).toContain("00:01:02.250 --> 00:01:03.000");
  });
});

describe("toAssKaraoke", () => {
  it("declares PlayResX/PlayResY so libass scales to the real output resolution", () => {
    const ass = toAssKaraoke(cues, DEFAULT_CAPTION_STYLE);
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
  });

  it("emits one Dialogue line per cue with per-word \\k karaoke tags", () => {
    const ass = toAssKaraoke(cues, DEFAULT_CAPTION_STYLE);
    const dialogueLines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogueLines).toHaveLength(2);
    // First word spans 0->0.5s = 50 centiseconds.
    expect(dialogueLines[0]).toContain("{\\k50}Hello");
    // Second word spans 0.5->1.5s = 100 centiseconds.
    expect(dialogueLines[0]).toContain("{\\k100}world");
  });

  it("strips characters that would break the {\\...} override-tag syntax", () => {
    const withBraces: CaptionCue[] = [
      {
        start: 0,
        end: 1,
        text: "a{b}c\\d",
        words: [{ start: 0, end: 1, text: "a{b}c\\d" }],
      },
    ];
    const ass = toAssKaraoke(withBraces, DEFAULT_CAPTION_STYLE);
    const dialogueLine = ass.split("\n").find((l) => l.startsWith("Dialogue:"));
    // "a{b}c\d" with {, }, and \ stripped -> "abcd".
    expect(dialogueLine).toContain("abcd");
    expect(dialogueLine).not.toContain("{b}");
  });

  it("gives every karaoke duration at least 1 centisecond even for a zero-length word", () => {
    const zeroLength: CaptionCue[] = [
      {
        start: 0,
        end: 1,
        text: "a b",
        words: [
          { start: 0, end: 0, text: "a" },
          { start: 0, end: 1, text: "b" },
        ],
      },
    ];
    const ass = toAssKaraoke(zeroLength, DEFAULT_CAPTION_STYLE);
    expect(ass).toContain("{\\k1}a");
  });
});
