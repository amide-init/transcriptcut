import { describe, expect, it } from "vitest";
import { buildPropertiesCss, buildPropertiesSvgValues } from "@/lib/video/properties";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";

describe("buildPropertiesCss", () => {
  it("is empty at all-neutral defaults", () => {
    expect(buildPropertiesCss(DEFAULT_VIDEO_PROPERTIES)).toBe("");
  });

  it("saturate() uses 1 + pct/100, matching ffmpeg's eq=saturation= exactly", () => {
    const css = buildPropertiesCss({ ...DEFAULT_VIDEO_PROPERTIES, saturation: 20 });
    expect(css).toBe("saturate(1.200)");
  });

  it("contrast() uses 1 + pct/100 with no cross-term from shadows", () => {
    const css = buildPropertiesCss({ ...DEFAULT_VIDEO_PROPERTIES, contrast: 40, shadows: 100 });
    expect(css).toBe("contrast(1.400)");
  });

  it("brightness() is 2^(exposure/100) -- exact match to the exposure filter's stops, not linear", () => {
    const css = buildPropertiesCss({ ...DEFAULT_VIDEO_PROPERTIES, exposure: 100 });
    expect(css).toBe(`brightness(${Math.pow(2, 1).toFixed(3)})`);
  });

  it("never produces a negative saturate/contrast multiplier", () => {
    const css = buildPropertiesCss({ ...DEFAULT_VIDEO_PROPERTIES, saturation: -100, contrast: -100 });
    expect(css).toBe("saturate(0.000) contrast(0.000)");
  });
});

describe("buildPropertiesSvgValues", () => {
  it("is the identity transform at all-neutral defaults", () => {
    const v = buildPropertiesSvgValues(DEFAULT_VIDEO_PROPERTIES);
    expect(v.highlightsSlope).toBe(1);
    expect(v.shadowsExponent).toBe(1);
    expect(v.colorMatrix).toBe("1 0 0 0 0.000  0 1 0 0 0.000  0 0 1 0 0.000  0 0 0 1 0");
  });

  it("highlights slope matches colorlevels' input-white-point remap for highlights > 0", () => {
    // Verified against ffmpeg's colorlevels filter: output = clamp(input/imax, 0, 1).
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, highlights: 50 });
    const imax = Math.min(1, Math.max(0.4, 1 - 50 / 250));
    expect(v.highlightsSlope).toBeCloseTo(1 / imax, 10);
  });

  it("highlights slope matches colorlevels' output-white-point remap for highlights < 0", () => {
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, highlights: -100 });
    const omax = Math.min(1, Math.max(0.4, 1 + -100 / 250));
    expect(v.highlightsSlope).toBeCloseTo(omax, 10);
    expect(v.highlightsSlope).toBe(0.6);
  });

  it("shadows exponent is 2^(-shadows/100), positive shadows brightening (exponent < 1)", () => {
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, shadows: 50 });
    expect(v.shadowsExponent).toBeCloseTo(Math.pow(2, -0.5), 10);
    expect(v.shadowsExponent).toBeLessThan(1);
  });

  it("negative shadows darken (exponent > 1)", () => {
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, shadows: -50 });
    expect(v.shadowsExponent).toBeGreaterThan(1);
  });

  it("positive temperature shifts red up and blue down (warmer)", () => {
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, temperature: 100 });
    const [rShift, , bShift] = v.colorMatrix
      .split(/\s{2}/)
      .map((row) => Number(row.trim().split(/\s+/).pop()));
    expect(rShift).toBeGreaterThan(0);
    expect(bShift).toBeLessThan(0);
  });

  it("positive tint shifts toward magenta (red and blue up, green down)", () => {
    const v = buildPropertiesSvgValues({ ...DEFAULT_VIDEO_PROPERTIES, tint: 100 });
    const [rShift, gShift, bShift] = v.colorMatrix
      .split(/\s{2}/)
      .map((row) => Number(row.trim().split(/\s+/).pop()));
    expect(rShift).toBeGreaterThan(0);
    expect(gShift).toBeLessThan(0);
    expect(bShift).toBeGreaterThan(0);
  });
});
