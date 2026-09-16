"use client";

import { useEffect, useRef } from "react";
import { computeRangePeaks } from "@/lib/timeline/waveform";

const BAR_WIDTH_PX = 2;

/** Renders one segment of the audio waveform (a single playable range) into a canvas. */
export function Waveform({
  buffer,
  start,
  end,
}: {
  buffer: AudioBuffer;
  start: number;
  end: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const buckets = Math.max(1, Math.floor(width / BAR_WIDTH_PX));
    const peaks = computeRangePeaks(buffer, start, end, buckets);

    const barWidth = width / buckets;
    const mid = height / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    peaks.forEach((peak, i) => {
      const barHeight = Math.max(1, peak * height);
      ctx.fillRect(i * barWidth, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    });
  }, [buffer, start, end]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
