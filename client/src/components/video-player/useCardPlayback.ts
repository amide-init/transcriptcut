import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { usePlayerStore } from "@/stores/player-store";
import type { CardSlot } from "@/lib/timeline/program";
import type { Program } from "@/lib/timeline/useProgram";

const EPSILON = 0.001;

/**
 * Plays title cards in the preview. The export renders cards as real frames
 * (lib/ffmpeg/plan.ts); the preview can't insert frames into a <video>, so
 * when playback crosses the moment a card plays before, it pauses the video
 * on that moment, shows the card (CardPreview) on a clock of its own, then
 * resumes. Cards at the same moment play back to back; outro cards play
 * once the last kept range ends.
 *
 * The player store's `card` is the source of truth, so the timeline can
 * also open a card directly (clicking its block).
 */
export function useCardPlayback(videoRef: RefObject<HTMLVideoElement | null>, program: Program) {
  const card = usePlayerStore((s) => s.card);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setCard = usePlayerStore((s) => s.setCard);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);

  /** Source time of the last frame seen while playing; -1 so an intro card at 0 plays on the first frame. */
  const lastTimeRef = useRef(-1);
  /** Set when we pause the video ourselves, so onPause doesn't read it as the user stopping. */
  const ignorePauseRef = useRef(false);
  const outroPlayedRef = useRef(false);

  const { slots, editedDuration } = program;
  const isOutro = useCallback((s: CardSlot) => s.editedAt >= editedDuration - EPSILON, [editedDuration]);

  const start = useCallback(
    (slot: CardSlot) => {
      const video = videoRef.current;
      if (video && !video.paused) {
        ignorePauseRef.current = true;
        video.pause();
      }
      if (video && !isOutro(slot)) video.currentTime = slot.resumeAt;
      setCard({ id: slot.card.id, elapsed: 0 });
      setIsPlaying(true);
    },
    [videoRef, isOutro, setCard, setIsPlaying]
  );

  /** Called for every presented frame while playing. True when a card took over. */
  const handleFrame = useCallback(
    (mediaTime: number, paused: boolean): boolean => {
      if (usePlayerStore.getState().card) return true;
      if (paused) return false;
      const last = lastTimeRef.current;
      lastTimeRef.current = mediaTime;
      const crossed = slots.find(
        (s) => !isOutro(s) && s.resumeAt > last + EPSILON / 2 && s.resumeAt <= mediaTime + EPSILON
      );
      if (crossed) {
        start(crossed);
        return true;
      }
      return false;
    },
    [slots, isOutro, start]
  );

  /** Called when playback runs off the end of the last kept range. True when an outro took over. */
  const handleEnd = useCallback((): boolean => {
    if (usePlayerStore.getState().card) return true;
    if (outroPlayedRef.current) return false;
    const outro = slots.find(isOutro);
    if (!outro) return false;
    outroPlayedRef.current = true;
    start(outro);
    return true;
  }, [slots, isOutro, start]);

  /** A seek resets what counts as "crossed": a card exactly at the target plays when playback starts. */
  const noteSeek = useCallback((target: number) => {
    lastTimeRef.current = target - EPSILON;
    outroPlayedRef.current = false;
  }, []);

  /** Play/pause while a card shows only runs or stops the card's clock. True when handled. */
  const togglePlay = useCallback((): boolean => {
    if (!usePlayerStore.getState().card) return false;
    setIsPlaying(!usePlayerStore.getState().isPlaying);
    return true;
  }, [setIsPlaying]);

  // The card clock. Finishing a card moves to the next one at the same
  // moment, or resumes the video (stops, after the last outro).
  useEffect(() => {
    if (!card || !isPlaying) return;
    const slot = slots.find((s) => s.card.id === card.id);
    if (!slot) {
      setCard(null);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    let elapsed = card.elapsed;
    const tick = (now: number) => {
      elapsed += (now - previous) / 1000;
      previous = now;
      if (elapsed < slot.card.duration) {
        setCard({ id: card.id, elapsed });
        frame = requestAnimationFrame(tick);
        return;
      }
      const samePoint = slots.filter((s) => Math.abs(s.editedAt - slot.editedAt) <= EPSILON);
      const next = samePoint[samePoint.indexOf(slot) + 1];
      if (next) {
        setCard({ id: next.card.id, elapsed: 0 });
        return;
      }
      setCard(null);
      lastTimeRef.current = slot.resumeAt;
      if (isOutro(slot)) {
        setIsPlaying(false);
      } else {
        videoRef.current?.play();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // card.elapsed is read once per start; re-running on every tick would restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isPlaying, slots, isOutro, setCard, setIsPlaying, videoRef]);

  // Stable across renders: VideoPlayer's frame-callback effect depends on
  // this, and re-registering it every render would reset its seek guard.
  return useMemo(
    () => ({ handleFrame, handleEnd, noteSeek, togglePlay, ignorePauseRef }),
    [handleFrame, handleEnd, noteSeek, togglePlay]
  );
}
