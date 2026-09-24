"use client";

import { useClipStore } from "@/stores/clip-store";
import { usePlayerStore } from "@/stores/player-store";
import { CLIP_OUTPUT_SIZE } from "@/types/clips";

/**
 * Outlines the focused clip's crop on the player and dims what will be cut
 * away -- the same geometry as the export's crop (server lib/ffmpeg/plan.ts
 * #buildReframeFilter): full height sliding by cropX when the source is
 * wider than the target, full width centered when it's taller.
 *
 * The player box can be letterboxed around the video (object-contain), so
 * the overlay first sizes itself to the video's actual on-screen rectangle
 * with container query units (the parent is a size container) -- measured:
 * positioning against the player box itself put the crop frame about 20%
 * too wide and shifted left.
 */
export function CropOverlay() {
  const focused = useClipStore((s) => s.focused);
  const sourceRatio = usePlayerStore((s) => s.aspectRatio);
  if (!focused || !sourceRatio) return null;

  const { width, height } = CLIP_OUTPUT_SIZE[focused.aspect];
  const targetRatio = width / height;
  const box =
    sourceRatio > targetRatio
      ? (() => {
          const w = targetRatio / sourceRatio;
          return { left: (1 - w) * focused.cropX, top: 0, width: w, height: 1 };
        })()
      : (() => {
          const h = sourceRatio / targetRatio;
          return { left: 0, top: (1 - h) / 2, width: 1, height: h };
        })();

  return (
    <div
      className="pointer-events-none absolute inset-0 m-auto"
      style={{
        width: `min(100cqw, calc(100cqh * ${sourceRatio}))`,
        height: `min(100cqh, calc(100cqw / ${sourceRatio}))`,
      }}
    >
      <div
        className="absolute rounded-sm ring-2 ring-primary"
        style={{
          left: `${box.left * 100}%`,
          top: `${box.top * 100}%`,
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
        }}
      />
    </div>
  );
}
