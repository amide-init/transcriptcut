import { useEffect, useRef, useState, type RefObject } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { transitionLookAt } from "@/lib/timeline/transition-look";
import { programPlayhead, type Program } from "@/lib/timeline/useProgram";
import { CardPreview } from "@/components/video-player/CardPreview";
import type { CardOperation } from "@/types/edit-operation";

/**
 * Previews transitions over the player: a color layer for dips and the
 * episode's fade in/out, and a fading title card for crossfades. Driven by
 * its own animation-frame loop reading the video's live time, and styled
 * through refs, so fades are smooth without re-rendering the editor every
 * frame (the store's currentTime only updates a few times a second).
 * Audio fades aren't previewed; the export applies them.
 */
export function TransitionOverlay({
  videoRef,
  program,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  program: Program;
}) {
  const colorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [fadingCard, setFadingCard] = useState<CardOperation | null>(null);
  const fadingCardIdRef = useRef<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const t = programPlayhead(program, video.currentTime, usePlayerStore.getState().card);
        const look = transitionLookAt(program, t);
        if (colorRef.current) {
          colorRef.current.style.opacity = String(look.color?.opacity ?? 0);
          if (look.color) colorRef.current.style.backgroundColor = look.color.color;
        }
        const cardId = look.card?.card.id ?? null;
        if (cardId !== fadingCardIdRef.current) {
          fadingCardIdRef.current = cardId;
          setFadingCard(look.card?.card ?? null);
        }
        if (cardRef.current) cardRef.current.style.opacity = String(look.card?.opacity ?? 0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [videoRef, program]);

  return (
    <>
      <div ref={cardRef} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }}>
        {/* elapsed 0 hides the text: the export's card text only starts once the blend is done. */}
        {fadingCard && <CardPreview card={fadingCard} elapsed={0} />}
      </div>
      <div ref={colorRef} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }} />
    </>
  );
}
