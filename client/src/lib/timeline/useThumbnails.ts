"use client";

import { useEffect, useState } from "react";
import type { CutOperation } from "@/types/edit-operation";
import { computePlayableRanges } from "@/lib/timeline/cuts";

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 54;
/** Fallback thumbnail budget for callers that don't scale it with zoom (see Timeline.tsx). */
const DEFAULT_TOTAL_THUMBNAILS = 24;

export type RangeThumbnails = Record<number, string[]>;

/**
 * Grabs a filmstrip of frame thumbnails per playable range, from an
 * offscreen <video> element decoupled from the live playback one in
 * VideoPlayer -- seeking here never disturbs actual playback. Timestamps
 * are source-video time (playableRanges are already in source time, per
 * lib/timeline/cuts.ts), so cut-out sections are skipped automatically.
 *
 * `totalThumbnails` is roughly how many thumbnails to spread across the
 * whole edited timeline -- callers scale it with zoom level (issue #17) so
 * zooming in reveals denser thumbnails instead of stretching the same set.
 *
 * Returns a map of playable-range index -> ordered data URLs, filled in
 * progressively as frames are grabbed (sequential seeks, not parallel --
 * a single <video> element can only be at one currentTime at a time).
 */
export function useThumbnails(
  videoUrl: string | null,
  duration: number,
  cuts: CutOperation[],
  totalThumbnails: number = DEFAULT_TOTAL_THUMBNAILS
): RangeThumbnails {
  const [thumbnails, setThumbnails] = useState<RangeThumbnails>({});

  useEffect(() => {
    if (!videoUrl || duration <= 0) return;

    const playableRanges = computePlayableRanges(duration, cuts);
    if (playableRanges.length === 0) return;
    const editedDuration = playableRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
    if (editedDuration <= 0) return;

    let cancelled = false;
    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.preload = "auto";

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");

    function grabFrame(time: number): Promise<string | null> {
      return new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          if (!ctx) return resolve(null);
          try {
            ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
            resolve(canvas.toDataURL("image/jpeg", 0.6));
          } catch {
            resolve(null);
          }
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = time;
      });
    }

    (async () => {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) return resolve();
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
      if (cancelled) return;

      for (let i = 0; i < playableRanges.length; i++) {
        const r = playableRanges[i];
        const span = r.end - r.start;
        const count = Math.max(1, Math.round((span / editedDuration) * totalThumbnails));

        for (let k = 0; k < count; k++) {
          if (cancelled) return;
          const time = r.start + (span * (k + 0.5)) / count;
          const dataUrl = await grabFrame(time);
          if (cancelled) return;
          if (dataUrl) {
            setThumbnails((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), dataUrl] }));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      video.src = "";
    };
  }, [videoUrl, duration, cuts, totalThumbnails]);

  return thumbnails;
}
