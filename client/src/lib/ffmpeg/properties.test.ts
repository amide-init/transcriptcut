import { describe, expect, it } from "vitest";
import { buildPropertiesFilter } from "@/lib/ffmpeg/properties";
import { DEFAULT_VIDEO_PROPERTIES } from "@/types/video-properties";

describe("buildPropertiesFilter", () => {
  it("returns null at all-neutral defaults (no filter step needed)", () => {
    expect(buildPropertiesFilter(DEFAULT_VIDEO_PROPERTIES)).toBeNull();
  });

  it("maps saturation/contrast via eq", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, saturation: 20, contrast: 40 });
    expect(filter).toBe("eq=saturation=1.200:contrast=1.400");
  });

  it("positive shadows LIFTS/brightens shadows -- negative black, not positive (regression test)", () => {
    // A positive `black` value on ffmpeg's exposure filter crushes shadows
    // (verified empirically by rendering a test gradient) -- this was
    // previously inverted. Positive props.shadows must map to NEGATIVE black.
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, shadows: 90 });
    expect(filter).toContain("black=-0.300");
  });

  it("negative shadows crushes -- positive black", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, shadows: -90 });
    expect(filter).toContain("black=0.300");
  });

  it("clamps black to [-1, 1] even for an out-of-range shadows value", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, shadows: -1000 });
    expect(filter).toContain("black=1.000");
  });

  it("highlights > 0 lowers the input white point (colorlevels imax)", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, highlights: 50 });
    expect(filter).toContain("colorlevels=rimax=0.800:gimax=0.800:bimax=0.800");
  });

  it("highlights < 0 lowers the output white point (colorlevels omax), never imax > 1", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, highlights: -100 });
    expect(filter).toContain("colorlevels=romax=0.600:gomax=0.600:bomax=0.600");
    expect(filter).not.toContain("imax");
  });

  it("positive temperature (warmer) lowers the Kelvin value", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, temperature: 100 });
    expect(filter).toContain("colortemperature=temperature=4500");
  });

  it("tint shifts red/blue one way and green the other on the midtone range only", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, tint: 90 });
    expect(filter).toContain("colorbalance=rm=0.300:gm=-0.300:bm=0.300");
  });

  it("joins multiple active properties into one comma-separated filter chain", () => {
    const filter = buildPropertiesFilter({ ...DEFAULT_VIDEO_PROPERTIES, saturation: 10, temperature: 50 });
    expect(filter).toBe("eq=saturation=1.100:contrast=1.000,colortemperature=temperature=5500");
  });
});
