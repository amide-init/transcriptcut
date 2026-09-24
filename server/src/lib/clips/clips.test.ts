import { describe, expect, it } from "vitest";
import { clipAsCuts, highlightsFromPicks } from "@/lib/clips/clips";
import type { EditedSentence } from "@/lib/publishing/edited-transcript";

describe("clipAsCuts", () => {
  it("cuts everything before and after the clip", () => {
    expect(clipAsCuts({ sourceStart: 10, sourceEnd: 40 }, 100).map((c) => [c.start, c.end])).toEqual([
      [0, 10],
      [40, 100],
    ]);
  });

  it("skips a cut that would be empty at either edge", () => {
    expect(clipAsCuts({ sourceStart: 0, sourceEnd: 100 }, 100)).toEqual([]);
  });
});

// One 8s sentence every 10s on the edited timeline; source is 2s later (a cut at the start).
const sentences: EditedSentence[] = Array.from({ length: 40 }, (_, i) => ({
  sourceStart: i * 10 + 2,
  sourceEnd: i * 10 + 10,
  start: i * 10,
  end: i * 10 + 8,
  text: `Sentence ${i}.`,
}));
const pick = (startSentence: number, endSentence: number, title = "T") => ({
  startSentence,
  endSentence,
  title,
  reason: "Because.",
});

describe("highlightsFromPicks", () => {
  it("takes bounds from sentence word timings, with a little breathing room", () => {
    const [clip] = highlightsFromPicks([pick(3, 5, "Great story")], sentences, 1000);
    expect(clip).toMatchObject({
      name: "Great story",
      sourceStart: 31.9,
      sourceEnd: 60.3,
      aspect: "9:16",
      source: "ai",
      reason: "Because.",
    });
  });

  it("shortens a pick that's too long from the end, and drops one that's too short", () => {
    const clips = highlightsFromPicks([pick(0, 20), pick(30, 30)], sentences, 1000);
    expect(clips).toHaveLength(1);
    // 0..8 would be 88s -- the longest run of whole sentences within 90s.
    expect(clips[0].sourceEnd).toBeCloseTo(90.3);
  });

  it("drops invalid indices and overlaps with an earlier pick", () => {
    const clips = highlightsFromPicks(
      [pick(10, 13, "First"), pick(12, 16, "Overlaps"), pick(-1, 3), pick(5, 99), pick(20, 18), pick(1.5, 4)],
      sentences,
      1000
    );
    expect(clips.map((c) => c.name)).toEqual(["First"]);
  });

  it("returns clips in timeline order and caps the count", () => {
    const picks = [30, 0, 5, 10, 15, 20, 25, 35].map((s) => pick(s, s + 2));
    picks.push(pick(38, 39));
    const clips = highlightsFromPicks(picks, sentences, 1000);
    expect(clips).toHaveLength(8);
    expect(clips.map((c) => c.sourceStart)).toEqual([...clips.map((c) => c.sourceStart)].sort((a, b) => a - b));
  });

  it("strips control characters from titles and falls back to a default name", () => {
    const [a, b] = highlightsFromPicks([pick(0, 2, "  Hi\n\tthere "), pick(10, 12, "\n")], sentences, 1000);
    expect(a.name).toBe("Hi there");
    expect(b.name).toBe("Highlight 2");
  });
});
