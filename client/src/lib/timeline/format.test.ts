import { describe, expect, it } from "vitest";
import { formatTimecode } from "@/lib/timeline/format";

describe("formatTimecode", () => {
  it("formats zero", () => {
    expect(formatTimecode(0)).toBe("0:00");
  });

  it("pads seconds under 10", () => {
    expect(formatTimecode(5)).toBe("0:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimecode(125)).toBe("2:05");
  });

  it("truncates fractional seconds", () => {
    expect(formatTimecode(59.9)).toBe("0:59");
  });

  it("does not pad minutes past 9", () => {
    expect(formatTimecode(3725)).toBe("62:05");
  });
});
