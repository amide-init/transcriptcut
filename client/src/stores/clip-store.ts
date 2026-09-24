import { create } from "zustand";
import type { ClipAspect } from "@/types/clips";

type ClipStore = {
  /** The clip being edited in the Clips panel -- the player outlines its crop frame. */
  focused: { id: string; aspect: ClipAspect; cropX: number } | null;
  setFocused: (focused: ClipStore["focused"]) => void;
};

export const useClipStore = create<ClipStore>((set) => ({
  focused: null,
  setFocused: (focused) => set({ focused }),
}));
