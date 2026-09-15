import { create } from "zustand";

type PlayerStore = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** Set by seek(); the video element consumes it then clears it back to null. */
  seekTarget: number | null;
  /** The live <video> node, for imperative reads like grabbing a frame for a thumbnail. */
  videoElement: HTMLVideoElement | null;

  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  seek: (time: number) => void;
  clearSeekTarget: () => void;
  setVideoElement: (el: HTMLVideoElement | null) => void;
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  seekTarget: null,
  videoElement: null,

  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  seek: (time) => set({ seekTarget: time }),
  clearSeekTarget: () => set({ seekTarget: null }),
  setVideoElement: (videoElement) => set({ videoElement }),
}));
