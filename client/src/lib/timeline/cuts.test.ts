import { describe, expect, it } from "vitest";
import {
  computePlayableRanges,
  editedTimeToSourceTime,
  getEditedDuration,
  isCut,
  isFullyCut,
  isWordCut,
  nextPlayableTime,
  sourceTimeToEditedTime,
} from "@/lib/timeline/cuts";
import type { CutOperation } from "@/types/edit-operation";
import type { PlayableRange } from "@/types/timeline";

function cut(start: number, end: number): CutOperation {
  return { id: `${start}-${end}`, type: "cut", start, end, createdAt: 0 };
}

describe("computePlayableRanges", () => {
  it("returns the whole duration with no cuts", () => {
    expect(computePlayableRanges(10, [])).toEqual([{ start: 0, end: 10 }]);
  });

  it("returns nothing for a non-positive duration", () => {
    expect(computePlayableRanges(0, [])).toEqual([]);
    expect(computePlayableRanges(-5, [])).toEqual([]);
  });

  it("subtracts a single interior cut", () => {
    expect(computePlayableRanges(10, [cut(3, 5)])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });

  it("subtracts a cut touching the start", () => {
    expect(computePlayableRanges(10, [cut(0, 3)])).toEqual([{ start: 3, end: 10 }]);
  });

  it("subtracts a cut touching the end", () => {
    expect(computePlayableRanges(10, [cut(7, 10)])).toEqual([{ start: 0, end: 7 }]);
  });

  it("returns nothing when the whole video is cut", () => {
    expect(computePlayableRanges(10, [cut(0, 10)])).toEqual([]);
  });

  it("returns nothing when a cut overruns the duration", () => {
    expect(computePlayableRanges(10, [cut(0, 999)])).toEqual([]);
  });

  it("merges overlapping cuts", () => {
    expect(computePlayableRanges(10, [cut(2, 5), cut(4, 7)])).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 10 },
    ]);
  });

  it("merges adjacent (touching) cuts", () => {
    expect(computePlayableRanges(10, [cut(2, 5), cut(5, 7)])).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 10 },
    ]);
  });

  it("handles cuts given out of order", () => {
    expect(computePlayableRanges(10, [cut(7, 9), cut(1, 2)])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 7 },
      { start: 9, end: 10 },
    ]);
  });

  it("drops a zero-length surviving range between back-to-back cuts", () => {
    // Cuts [1,3) and [3,3.0000001) leave essentially nothing between them once
    // merged/clamped -- computePlayableRanges must not emit a degenerate range.
    expect(computePlayableRanges(10, [cut(0, 3), cut(3, 10)])).toEqual([]);
  });
});

describe("getEditedDuration", () => {
  it("sums range lengths", () => {
    const ranges: PlayableRange[] = [
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ];
    expect(getEditedDuration(ranges)).toBe(8);
  });

  it("is zero for no ranges", () => {
    expect(getEditedDuration([])).toBe(0);
  });
});

describe("isCut", () => {
  const ranges: PlayableRange[] = [
    { start: 0, end: 3 },
    { start: 5, end: 10 },
  ];

  it("is false inside a playable range", () => {
    expect(isCut(1, ranges)).toBe(false);
  });

  it("is true inside the gap between ranges", () => {
    expect(isCut(4, ranges)).toBe(true);
  });

  it("treats a range's start as playable and its end as not (half-open)", () => {
    expect(isCut(0, ranges)).toBe(false);
    expect(isCut(3, ranges)).toBe(true);
  });
});

describe("isWordCut / isFullyCut", () => {
  const cuts = [cut(2, 5)];

  it("a word fully inside a cut is cut", () => {
    expect(isWordCut(2.5, 3, cuts)).toBe(true);
  });

  it("a word entirely outside any cut is not cut", () => {
    expect(isWordCut(6, 7, cuts)).toBe(false);
  });

  it("a word straddling the cut boundary is not (fully) cut", () => {
    expect(isWordCut(4, 6, cuts)).toBe(false);
  });

  it("isFullyCut requires every word to be individually cut", () => {
    const words = [
      { id: "a", text: "a", start: 2.1, end: 2.5 },
      { id: "b", text: "b", start: 2.6, end: 3 },
    ];
    expect(isFullyCut(words, cuts)).toBe(true);
  });

  it("isFullyCut is false if any single word survives", () => {
    const words = [
      { id: "a", text: "a", start: 2.1, end: 2.5 },
      { id: "b", text: "b", start: 6, end: 7 },
    ];
    expect(isFullyCut(words, cuts)).toBe(false);
  });

  it("isFullyCut is false for an empty word list", () => {
    expect(isFullyCut([], cuts)).toBe(false);
  });
});

describe("nextPlayableTime", () => {
  const ranges: PlayableRange[] = [
    { start: 0, end: 3 },
    { start: 5, end: 10 },
  ];

  it("returns the same time if already playable", () => {
    expect(nextPlayableTime(1, ranges)).toBe(1);
  });

  it("jumps forward to the next range's start when inside a cut", () => {
    expect(nextPlayableTime(4, ranges)).toBe(5);
  });

  it("returns null at/after the end of the last range", () => {
    expect(nextPlayableTime(10, ranges)).toBeNull();
    expect(nextPlayableTime(50, ranges)).toBeNull();
  });
});

describe("sourceTimeToEditedTime / editedTimeToSourceTime round-trip", () => {
  const ranges: PlayableRange[] = [
    { start: 0, end: 3 },
    { start: 5, end: 10 },
  ];

  it("maps source time in the first range unchanged", () => {
    expect(sourceTimeToEditedTime(1, ranges)).toBe(1);
  });

  it("maps source time in the second range, collapsing the gap", () => {
    // 5s of first range consumed (0-3), then 2s into the second range (5-7) -> edited time 3+2=5
    expect(sourceTimeToEditedTime(7, ranges)).toBe(5);
  });

  it("clamps time inside a cut gap to the elapsed edited time so far", () => {
    expect(sourceTimeToEditedTime(4, ranges)).toBe(3);
  });

  it("is the exact inverse of editedTimeToSourceTime for playable instants", () => {
    // Excludes exact range-boundary instants (e.g. 5, the start of the
    // second range) on purpose: at a boundary shared between two adjacent
    // ranges, multiple source times legitimately map to the same edited
    // time (see the dedicated boundary test below), so round-tripping
    // isn't well-defined there.
    for (const sourceTime of [0, 1, 2.5, 5.001, 7, 9.999]) {
      const edited = sourceTimeToEditedTime(sourceTime, ranges);
      expect(editedTimeToSourceTime(edited, ranges)).toBeCloseTo(sourceTime, 10);
    }
  });

  it("resolves the range-boundary ambiguity toward the earlier range's end", () => {
    // Edited time 3 sits exactly between range 1 ending (source 3) and
    // range 2 starting (source 5) -- both are "correct" since the cut
    // between them is invisible on the edited timeline. editedTimeToSourceTime
    // deterministically picks the earlier range's end.
    expect(sourceTimeToEditedTime(5, ranges)).toBe(3);
    expect(editedTimeToSourceTime(3, ranges)).toBe(3);
  });

  it("editedTimeToSourceTime clamps past-the-end time to the last range's end", () => {
    const editedDuration = getEditedDuration(ranges);
    expect(editedTimeToSourceTime(editedDuration + 100, ranges)).toBe(10);
  });

  it("editedTimeToSourceTime returns 0 for an empty range list", () => {
    expect(editedTimeToSourceTime(5, [])).toBe(0);
  });
});
