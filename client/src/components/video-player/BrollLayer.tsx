import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useMediaStore } from "@/stores/media-store";
import { programPlayhead, type Program } from "@/lib/timeline/useProgram";
import type { PlacedOverlay } from "@/lib/timeline/program";
import type { OverlayCorner } from "@/types/edit-operation";

/** Must match PIP_WIDTH_FRACTION / PIP_INSET_FRACTION in the server's lib/ffmpeg/plan.ts. */
const PIP_WIDTH_PERCENT = 32;
const PIP_INSET_PERCENT = 4;
/** How far a B-roll video may drift from where it should be before it's re-seeked. */
const MAX_DRIFT_SECONDS = 0.25;

function pipStyle(corner: OverlayCorner): CSSProperties {
  const inset = `${PIP_INSET_PERCENT}cqmin`;
  return {
    width: `${PIP_WIDTH_PERCENT}%`,
    ...(corner.startsWith("top") ? { top: inset } : { bottom: inset }),
    ...(corner.endsWith("left") ? { left: inset } : { right: inset }),
  };
}

/**
 * Shows B-roll over the player for its slot on the program timeline, laid
 * out like the export (full frame, cropped to fill, or picture-in-picture
 * in a corner). A video's position follows the program -- offset plus time
 * into the slot, holding its last frame if it runs short -- re-seeked only
 * when it drifts, and it plays and pauses with the editor. Muted: the
 * footage's audio is what plays.
 */
export function BrollLayer({ videoRef, program }: { videoRef: RefObject<HTMLVideoElement | null>; program: Program }) {
  const media = useMediaStore((s) => s.items);
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const [active, setActive] = useState<PlacedOverlay[]>([]);
  const activeKeyRef = useRef("");
  const videoEls = useRef(new Map<string, HTMLVideoElement>());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const { card, isPlaying } = usePlayerStore.getState();
        const t = programPlayhead(program, video.currentTime, card);
        const now = program.overlays.filter((o) => t >= o.start && t < o.end);
        const key = now.map((o) => o.overlay.id).join("|");
        if (key !== activeKeyRef.current) {
          activeKeyRef.current = key;
          setActive(now);
        }
        for (const placed of now) {
          const el = videoEls.current.get(placed.overlay.id);
          if (!el || Number.isNaN(el.duration)) continue;
          const target = Math.min((placed.overlay.offset ?? 0) + (t - placed.start), Math.max(0, el.duration - 0.05));
          if (Math.abs(el.currentTime - target) > MAX_DRIFT_SECONDS) el.currentTime = target;
          const shouldPlay = isPlaying && target < el.duration - 0.05;
          if (shouldPlay && el.paused) void el.play().catch(() => {});
          if (!shouldPlay && !el.paused) el.pause();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [videoRef, program]);

  return (
    <>
      {active.map(({ overlay }) => {
        const item = mediaById.get(overlay.assetId);
        if (!item) return null;
        const style: CSSProperties =
          overlay.mode === "full" ? { inset: 0, width: "100%", height: "100%" } : pipStyle(overlay.corner ?? "bottom-right");
        const className = `pointer-events-none absolute ${overlay.mode === "full" ? "object-cover" : "h-auto rounded-sm shadow-lg"}`;
        return item.type === "image" ? (
          <img key={overlay.id} src={item.url} alt="" className={className} style={style} draggable={false} />
        ) : (
          <video
            key={overlay.id}
            ref={(el) => {
              if (el) videoEls.current.set(overlay.id, el);
              else videoEls.current.delete(overlay.id);
            }}
            src={item.url}
            muted
            playsInline
            preload="auto"
            className={className}
            style={style}
          />
        );
      })}
    </>
  );
}
