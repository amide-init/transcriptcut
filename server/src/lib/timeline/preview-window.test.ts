import { describe, expect, it } from "vitest";
import { previewWindow } from "@/lib/timeline/preview-window";

const ranges = [
  { start: 0, end: 10 },
  { start: 20, end: 30 },
  { start: 40, end: 100 },
];

describe("previewWindow", () => {
  it("takes the requested length from inside one range", () => {
    expect(previewWindow(ranges, 45, 15)).toEqual([{ start: 45, end: 60 }]);
  });

  it("spans cuts, so the sample sounds like the export", () => {
    expect(previewWindow(ranges, 5, 15)).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 30 },
    ]);
  });

  it("starts at the next playable moment when the playhead is inside a cut", () => {
    expect(previewWindow(ranges, 12, 5)).toEqual([{ start: 20, end: 25 }]);
  });

  it("returns what's left when the program ends early", () => {
    expect(previewWindow(ranges, 95, 15)).toEqual([{ start: 95, end: 100 }]);
  });

  it("uses the last seconds of the program when the playhead is past the end", () => {
    expect(previewWindow(ranges, 100, 15)).toEqual([{ start: 85, end: 100 }]);
    expect(previewWindow([{ start: 0, end: 10 }, { start: 20, end: 25 }], 30, 8)).toEqual([
      { start: 7, end: 10 },
      { start: 20, end: 25 },
    ]);
  });

  it("returns nothing when everything is cut", () => {
    expect(previewWindow([], 0, 15)).toEqual([]);
  });
});
