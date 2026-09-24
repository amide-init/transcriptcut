import { describe, expect, it } from "vitest";
import {
  chaptersFromPicks,
  cleanChapterTitle,
  minChapterSeconds,
  resolveChapters,
  toFfmetadata,
  toYoutubeChapters,
} from "@/lib/publishing/chapters";
import type { EditedSentence } from "@/lib/publishing/edited-transcript";

// One sentence every 20s; source time = edited time + 5 (a 5s cut at the very start).
const sentences: EditedSentence[] = Array.from({ length: 30 }, (_, i) => ({
  sourceStart: i * 20 + 5,
  start: i * 20,
  end: i * 20 + 15,
  text: `Sentence ${i}.`,
}));

describe("chaptersFromPicks", () => {
  it("takes starts from the picked sentences, never from the model", () => {
    const chapters = chaptersFromPicks(
      [
        { sentenceIndex: 0, title: "Intro" },
        { sentenceIndex: 10, title: "Microphones" },
        { sentenceIndex: 20, title: "Editing" },
      ],
      sentences
    );
    expect(chapters.map((c) => [c.title, c.sourceStart])).toEqual([
      ["Intro", 5],
      ["Microphones", 205],
      ["Editing", 405],
    ]);
  });

  it("adds an Intro at the start when the model skipped sentence 0", () => {
    const chapters = chaptersFromPicks([{ sentenceIndex: 5, title: "Topic" }], sentences);
    expect(chapters.map((c) => c.title)).toEqual(["Intro", "Topic"]);
    expect(chapters[0].sourceStart).toBe(5);
  });

  it("drops out-of-range and non-integer indices, and sorts", () => {
    const chapters = chaptersFromPicks(
      [
        { sentenceIndex: 20, title: "Later" },
        { sentenceIndex: 99, title: "Nope" },
        { sentenceIndex: -1, title: "Nope" },
        { sentenceIndex: 2.5, title: "Nope" },
        { sentenceIndex: 0, title: "Start" },
      ],
      sentences
    );
    expect(chapters.map((c) => c.title)).toEqual(["Start", "Later"]);
  });

  it("merges chapters closer than 10s on the edited timeline into the earlier one", () => {
    const close: EditedSentence[] = [
      { sourceStart: 0, start: 0, end: 4, text: "a" },
      { sourceStart: 5, start: 5, end: 9, text: "b" },
      { sourceStart: 30, start: 30, end: 34, text: "c" },
    ];
    const chapters = chaptersFromPicks(
      [
        { sentenceIndex: 0, title: "One" },
        { sentenceIndex: 1, title: "Too close" },
        { sentenceIndex: 2, title: "Two" },
      ],
      close
    );
    expect(chapters.map((c) => c.title)).toEqual(["One", "Two"]);
  });

  it("enforces a caller-supplied minimum chapter length against bunched-up picks", () => {
    const chapters = chaptersFromPicks(
      [
        { sentenceIndex: 0, title: "Intro" },
        { sentenceIndex: 1, title: "Too soon" },
        { sentenceIndex: 2, title: "Also too soon" },
        { sentenceIndex: 15, title: "Real topic" },
      ],
      sentences,
      120
    );
    expect(chapters.map((c) => c.title)).toEqual(["Intro", "Real topic"]);
  });

  it("returns nothing when there's no speech", () => {
    expect(chaptersFromPicks([{ sentenceIndex: 0, title: "x" }], [])).toEqual([]);
  });
});

describe("minChapterSeconds", () => {
  it("scales with episode length between 10s and 3 minutes", () => {
    expect(minChapterSeconds(60)).toBe(10);
    expect(minChapterSeconds(1094)).toBe(109);
    expect(minChapterSeconds(7200)).toBe(180);
  });
});

describe("cleanChapterTitle", () => {
  it("strips control characters and newlines, collapses whitespace, and caps length", () => {
    expect(cleanChapterTitle("  Hello\n\tWorld\u0000 ")).toBe("Hello World");
    expect(cleanChapterTitle("x".repeat(200))).toHaveLength(80);
  });
});

describe("resolveChapters", () => {
  const ranges = [
    { start: 0, end: 100 },
    { start: 200, end: 400 },
  ];

  it("maps source time to edited time", () => {
    const resolved = resolveChapters(
      [
        { id: "a", title: "A", sourceStart: 0 },
        { id: "b", title: "B", sourceStart: 250 },
      ],
      ranges
    );
    expect(resolved.map((c) => c.start)).toEqual([0, 150]);
  });

  it("moves a chapter whose moment was cut to the next surviving moment", () => {
    const resolved = resolveChapters(
      [
        { id: "a", title: "A", sourceStart: 0 },
        { id: "b", title: "B", sourceStart: 150 },
      ],
      ranges
    );
    expect(resolved[1].start).toBe(100);
  });

  it("forces the first chapter to start at 0", () => {
    const resolved = resolveChapters([{ id: "a", title: "A", sourceStart: 20 }], ranges);
    expect(resolved[0].start).toBe(0);
  });

  it("drops chapters past the end of the program or too close to the previous one", () => {
    const resolved = resolveChapters(
      [
        { id: "a", title: "A", sourceStart: 0 },
        { id: "b", title: "B", sourceStart: 5 },
        { id: "c", title: "C", sourceStart: 300 },
        { id: "d", title: "D", sourceStart: 500 },
      ],
      ranges
    );
    expect(resolved.map((c) => [c.title, c.start])).toEqual([
      ["A", 0],
      ["C", 200],
    ]);
  });
});

describe("toYoutubeChapters", () => {
  it("uses mm:ss for short episodes and h:mm:ss past an hour", () => {
    const chapters = [
      { id: "a", title: "Intro", sourceStart: 0, start: 0 },
      { id: "b", title: "Deep dive", sourceStart: 0, start: 3725 },
    ];
    expect(toYoutubeChapters(chapters.slice(0, 1), 600)).toBe("00:00 Intro");
    expect(toYoutubeChapters(chapters, 4000)).toBe("0:00:00 Intro\n1:02:05 Deep dive");
  });
});

describe("toFfmetadata", () => {
  it("writes the title and millisecond chapter ranges ending at the next chapter or the end", () => {
    const text = toFfmetadata(
      [
        { id: "a", title: "Intro", sourceStart: 0, start: 0 },
        { id: "b", title: "Main", sourceStart: 0, start: 61.5 },
      ],
      120,
      "My Episode"
    );
    expect(text).toBe(
      ";FFMETADATA1\ntitle=My Episode\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=61500\ntitle=Intro\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=61500\nEND=120000\ntitle=Main\n"
    );
  });

  it("escapes metadata syntax so a title can't inject keys or sections", () => {
    const text = toFfmetadata([{ id: "a", title: "A=b;c#d\\e", sourceStart: 0, start: 0 }], 10, "T\n[CHAPTER]");
    expect(text).toContain("title=A\\=b\\;c\\#d\\\\e");
    expect(text).toContain("title=T [CHAPTER]");
    expect(text.match(/^\[CHAPTER\]$/gm)).toHaveLength(1);
  });
});
