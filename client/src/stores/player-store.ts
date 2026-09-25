import { create } from "zustand";
import type { CardOperation } from "@/types/edit-operation";

type PlayerStore = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** Set by seek(); the video element consumes it then clears it back to null. */
  seekTarget: number | null;
  /** The live <video> node, for imperative reads like grabbing a frame for a thumbnail. */
  videoElement: HTMLVideoElement | null;
  /**
   * The source video's native width/height ratio, once known. Drives the
   * preview's aspect box (EditorLayout.tsx) so the editor letterboxes the
   * same way -- or not at all -- as the actual export, instead of forcing
   * every source video into a fixed 16:9 box regardless of its own aspect
   * ratio (which produced pillarbox bars in the preview for e.g. portrait
   * video that the exported file never had).
   */
  aspectRatio: number | null;
  /**
   * The title card on screen, and how far into it playback is. While a
   * card shows, the <video> is paused on the frame after it and
   * `isPlaying` means "the card's clock is running" (useCardPlayback.ts).
   */
  card: { id: string; elapsed: number } | null;
  /** A card being edited in the Scenes panel, previewed over the player until the editor closes. */
  cardDraft: CardOperation | null;

  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  seek: (time: number) => void;
  clearSeekTarget: () => void;
  setVideoElement: (el: HTMLVideoElement | null) => void;
  setAspectRatio: (ratio: number | null) => void;
  setCard: (card: { id: string; elapsed: number } | null) => void;
  setCardDraft: (card: CardOperation | null) => void;
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  seekTarget: null,
  videoElement: null,
  aspectRatio: null,
  card: null,
  cardDraft: null,

  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  // Seeking anywhere leaves whatever card was showing.
  seek: (time) => set({ seekTarget: time, card: null }),
  clearSeekTarget: () => set({ seekTarget: null }),
  setVideoElement: (videoElement) => set({ videoElement }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setCard: (card) => set({ card }),
  setCardDraft: (cardDraft) => set({ cardDraft }),
}));
