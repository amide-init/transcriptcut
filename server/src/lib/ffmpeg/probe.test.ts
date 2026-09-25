import { describe, expect, it } from "vitest";
import { normalizeFrameRate } from "@/lib/ffmpeg/probe";

describe("normalizeFrameRate", () => {
  it("keeps ffprobe's rational rate as-is", () => {
    expect(normalizeFrameRate("30000/1001")).toBe("30000/1001");
    expect(normalizeFrameRate("25/1")).toBe("25/1");
  });

  it("falls back to 30 for a missing, zero or implausible rate", () => {
    expect(normalizeFrameRate(undefined)).toBe("30");
    expect(normalizeFrameRate("0/0")).toBe("30");
    expect(normalizeFrameRate("90000/1")).toBe("30");
    expect(normalizeFrameRate("30;evil")).toBe("30");
  });
});
