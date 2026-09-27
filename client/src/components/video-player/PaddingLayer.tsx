import { useEffect, useRef, type RefObject } from "react";
import { useClipStore } from "@/stores/clip-store";
import { usePlayerStore } from "@/stores/player-store";
import { padAt } from "@/lib/timeline/program";
import type { Program } from "@/lib/timeline/useProgram";

/**
 * Previews scene padding: shrinks the <video> about its center and shows
 * the border color behind it, over the video's own on-screen rectangle
 * (sized like CropOverlay, so the letterbox bars outside the frame stay
 * uncolored). Driven by its own animation-frame loop reading the video's
 * live time and styled through refs, like TransitionOverlay, so the
 * padding switches exactly at the scene boundary without re-rendering.
 * Clips skip padding in the export, so a focused clip previews without it.
 */
export function PaddingLayer({
  videoRef,
  program,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  program: Program;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sourceRatio = usePlayerStore((s) => s.aspectRatio);
  const clipFocused = useClipStore((s) => s.focused !== null);

  useEffect(() => {
    const video = videoRef.current;
    if (program.pads.length === 0 || clipFocused) {
      if (video) video.style.transform = "";
      if (frameRef.current) frameRef.current.style.opacity = "0";
      return;
    }
    let frame = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const pad = padAt(program.pads, v.currentTime);
        v.style.transform = pad ? `scale(${pad.scale})` : "";
        if (frameRef.current) {
          frameRef.current.style.opacity = pad ? "1" : "0";
          if (pad) frameRef.current.style.backgroundColor = pad.color;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (video) video.style.transform = "";
    };
  }, [videoRef, program, clipFocused]);

  if (!sourceRatio) return null;
  return (
    <div
      ref={frameRef}
      className="pointer-events-none absolute inset-0 m-auto"
      style={{
        width: `min(100cqw, calc(100cqh * ${sourceRatio}))`,
        height: `min(100cqh, calc(100cqw / ${sourceRatio}))`,
        opacity: 0,
      }}
    />
  );
}
