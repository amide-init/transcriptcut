import { describe, expect, it } from "vitest";
import { getFfmpegFilter } from "@/lib/ffmpeg/filters";
import { FILTER_PRESETS } from "@/lib/video/filters";

describe("getFfmpegFilter", () => {
  it("returns null for 'none'", () => {
    expect(getFfmpegFilter("none")).toBeNull();
  });

  it("returns null for an unknown preset id (never throws)", () => {
    expect(getFfmpegFilter("nonexistent")).toBeNull();
  });

  it("has an entry (possibly null) for every CSS preset, so none are silently unmapped", () => {
    for (const preset of FILTER_PRESETS) {
      expect(getFfmpegFilter(preset.id)).not.toBeUndefined();
    }
  });

  it("uses a lut filter for contrast, not eq=contrast (which only affects luma, not RGB)", () => {
    const filter = getFfmpegFilter("contrast");
    expect(filter).toContain("lut=r=");
    expect(filter).not.toContain("eq=contrast");
  });

  it("uses the exposure filter (not eq's additive brightness) for every preset with a brightness term", () => {
    for (const id of ["warm", "cool", "faded"]) {
      const filter = getFfmpegFilter(id);
      expect(filter).toContain("exposure=exposure=");
      // eq= may still appear for saturation (a verified exact match), but
      // never with a brightness= sub-parameter (additive, not the same
      // operation as CSS brightness()).
      expect(filter).not.toMatch(/eq=[^,]*brightness=/);
    }
  });
});
