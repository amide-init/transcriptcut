import { describe, expect, it } from "vitest";
import { buildScenes, gapBefore, sceneAt, snapToWordGap, sortedSplits } from "@/lib/timeline/scenes";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

const split = (id: string, timestamp: number, extra: Partial<EditOperation> = {}): EditOperation =>
  ({ id, type: "split", timestamp, createdAt: 0, ...extra }) as EditOperation;
const cut = (id: string, start: number, end: number): CutOperation => ({ id, type: "cut", start, end, createdAt: 0 });

describe("buildScenes", () => {
  it("is one scene covering the whole video when there are no splits", () => {
    const ranges = computePlayableRanges(100, []);
    expect(buildScenes(100, [], ranges)).toEqual([
      {
        id: "scene-start",
        splitId: null,
        index: 0,
        title: "Scene 1",
        source: null,
        start: 0,
        end: 100,
        editedStart: 0,
        editedEnd: 100,
      },
    ]);
  });

  it("divides at splits in time order and keeps their titles", () => {
    const ops = [split("b", 60, { title: "Pricing" } as Partial<EditOperation>), split("a", 20)];
    const scenes = buildScenes(100, ops, computePlayableRanges(100, []));
    expect(scenes.map((s) => [s.title, s.start, s.end, s.splitId])).toEqual([
      ["Scene 1", 0, 20, null],
      ["Scene 2", 20, 60, "a"],
      ["Pricing", 60, 100, "b"],
    ]);
  });

  it("places scenes on the edited timeline, with a fully cut scene collapsing to zero width", () => {
    const cuts = [cut("c1", 0, 10), cut("c2", 20, 60)];
    const ops: EditOperation[] = [...cuts, split("a", 20), split("b", 60)];
    const scenes = buildScenes(100, ops, computePlayableRanges(100, cuts));
    expect(scenes.map((s) => [s.editedStart, s.editedEnd])).toEqual([
      [0, 10],
      [10, 10],
      [10, 50],
    ]);
  });

  it("uses a split at 0 only to name the first scene", () => {
    const ops = [split("open", 0, { title: "Intro" } as Partial<EditOperation>), split("a", 30)];
    const scenes = buildScenes(100, ops, computePlayableRanges(100, []));
    expect(scenes.map((s) => [s.title, s.start, s.splitId])).toEqual([
      ["Intro", 0, "open"],
      ["Scene 2", 30, "a"],
    ]);
  });

  it("ignores splits at or outside the video's ends", () => {
    const ops = [split("a", 0), split("b", 100), split("c", 150)];
    expect(buildScenes(100, ops, computePlayableRanges(100, []))).toHaveLength(1);
  });
});

describe("sortedSplits", () => {
  it("drops a near-duplicate split, keeping the earlier-created one", () => {
    const ops = [
      split("late", 30.02, { createdAt: 5 } as Partial<EditOperation>),
      split("early", 30, { createdAt: 1 } as Partial<EditOperation>),
    ];
    expect(sortedSplits(ops, 100).map((s) => s.id)).toEqual(["early"]);
  });
});

describe("sceneAt", () => {
  it("finds the scene containing a source time", () => {
    const scenes = buildScenes(100, [split("a", 40)], computePlayableRanges(100, []));
    expect(sceneAt(scenes, 10)?.index).toBe(0);
    expect(sceneAt(scenes, 40)?.index).toBe(1);
    expect(sceneAt(scenes, 100)?.index).toBe(1);
  });
});

describe("snapToWordGap", () => {
  const words = [
    { start: 1, end: 2 },
    { start: 2.4, end: 3 },
    { start: 4, end: 5 },
  ];

  it("leaves a time that is already between words alone", () => {
    expect(snapToWordGap(3.5, words)).toBe(3.5);
  });

  it("moves a time inside a word to the middle of the nearer gap", () => {
    expect(snapToWordGap(2.5, words)).toBeCloseTo(2.2); // closer to the start of "2.4-3"
    expect(snapToWordGap(2.9, words)).toBeCloseTo(3.5); // closer to its end
  });

  it("returns the time unchanged with no words", () => {
    expect(snapToWordGap(7, [])).toBe(7);
  });
});

describe("gapBefore", () => {
  it("is the midpoint between the previous word's end and this word's start", () => {
    expect(gapBefore(4, [{ start: 1, end: 3 }, { start: 4, end: 5 }])).toBe(3.5);
  });
});
