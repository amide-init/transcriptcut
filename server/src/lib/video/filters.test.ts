import { describe, expect, it } from "vitest";
import { FILTER_PRESETS, getFilterPreset } from "@/lib/video/filters";

describe("getFilterPreset", () => {
  it("finds a preset by id", () => {
    expect(getFilterPreset("bw").label).toBe("Black & white");
  });

  it("falls back to the first preset (none) for an unknown id", () => {
    expect(getFilterPreset("nonexistent")).toBe(FILTER_PRESETS[0]);
    expect(getFilterPreset("nonexistent").id).toBe("none");
  });

  it("every preset has a non-empty css value", () => {
    for (const preset of FILTER_PRESETS) {
      expect(preset.css.length).toBeGreaterThan(0);
    }
  });
});
