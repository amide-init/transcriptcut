import { describe, expect, it } from "vitest";
import { computeRangePeaks } from "@/lib/timeline/waveform";

/** Minimal AudioBuffer stand-in -- only getChannelData/sampleRate are used. */
function makeBuffer(samples: number[], sampleRate = 10): AudioBuffer {
  return {
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("computeRangePeaks", () => {
  it("returns the requested number of buckets", () => {
    const buffer = makeBuffer(new Array(100).fill(0.1));
    expect(computeRangePeaks(buffer, 0, 10, 5)).toHaveLength(5);
  });

  it("finds the peak absolute amplitude per bucket", () => {
    // sampleRate=10 -> samples 0-9 are t=[0,1); bucket size = 10 samples / 2 buckets = 5.
    const samples = [0, 0.2, -0.9, 0.1, 0, /* bucket 2 */ 0.3, 0.3, 0.3, 0.3, 0.3];
    const buffer = makeBuffer(samples);
    const peaks = computeRangePeaks(buffer, 0, 1, 2);
    // float32 precision (Float32Array), not float64 -- lower toBeCloseTo digits.
    expect(peaks[0]).toBeCloseTo(0.9, 5);
    expect(peaks[1]).toBeCloseTo(0.3, 5);
  });

  it("only looks within [start, end)", () => {
    const samples = [0, 0, 0, /* loud outside range */ 1, 1, 1, 0, 0, 0, 0];
    const buffer = makeBuffer(samples);
    const peaks = computeRangePeaks(buffer, 0, 0.3, 1);
    expect(peaks[0]).toBe(0);
  });

  it("clamps to at least one sample per bucket even with more buckets than samples", () => {
    const buffer = makeBuffer([0.5, 0.5]);
    expect(() => computeRangePeaks(buffer, 0, 0.2, 50)).not.toThrow();
    expect(computeRangePeaks(buffer, 0, 0.2, 50)).toHaveLength(50);
  });
});
