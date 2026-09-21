"use client";

import { useEffect, useState } from "react";
import type { CutOperation } from "@/types/edit-operation";
import { computePlayableRanges } from "@/lib/timeline/cuts";

const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
/**
 * Default spacing when the caller doesn't pass its own `intervalSeconds` --
 * also the coarsest interval Timeline.tsx's zoom-driven calculation clamps
 * to at "fit" zoom, so zooming in only ever makes thumbnails denser, never
 * sparser than this.
 */
export const DEFAULT_INTERVAL_SECONDS = 2;
/** Finest spacing Timeline.tsx's zoom-driven calculation clamps to, even at max zoom -- see GitHub issue #26. */
export const MIN_INTERVAL_SECONDS = 1;
/** Safety cap per range so a pathologically long, uncut video can't queue up an unbounded number of sequential seeks. */
const MAX_THUMBNAILS_PER_RANGE = 200;

export type RangeThumbnails = Record<number, string[]>;

/**
 * Grabs a filmstrip of frame thumbnails per playable range, from an
 * offscreen <video> element decoupled from the live playback one in
 * VideoPlayer -- seeking here never disturbs actual playback. Timestamps
 * are source-video time (playableRanges are already in source time, per
 * lib/timeline/cuts.ts), so cut-out sections are skipped automatically.
 *
 * `intervalSeconds` is the spacing between thumbnails, not a total count --
 * longer videos/ranges get proportionally more thumbnails at the same
 * interval. Timeline.tsx derives this from the current zoom level (denser
 * as you zoom in, down to MIN_INTERVAL_SECONDS) so thumbnails stay roughly
 * the same size on screen instead of the same fixed set stretching wider
 * -- see GitHub issue #26.
 *
 * Returns a map of playable-range index -> ordered data URLs, filled in
 * progressively as frames are grabbed (sequential seeks, not parallel --
 * a single <video> element can only be at one currentTime at a time).
 */
export function useThumbnails(
  videoUrl: string | null,
  duration: number,
  cuts: CutOperation[],
  intervalSeconds: number = DEFAULT_INTERVAL_SECONDS
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
        const count = Math.max(1, Math.min(MAX_THUMBNAILS_PER_RANGE, Math.round(span / intervalSeconds)));

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
  }, [videoUrl, duration, cuts, intervalSeconds]);

  return thumbnails;
}
