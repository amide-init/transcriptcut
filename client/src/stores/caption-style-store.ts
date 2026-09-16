import { create } from "zustand";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/captions/style";

type CaptionStyleStore = {
  style: CaptionStyle;
  setStyle: (style: CaptionStyle) => void;
  /** Mirrors the "Burn in captions" checkbox -- also gates the live preview overlay, so what you see while editing matches what export will produce. */
  burnInCaptions: boolean;
  setBurnInCaptions: (burnInCaptions: boolean) => void;
};

/**
 * Shared between the export controls (ExportButton/CaptionStyleControls) and
 * the live preview overlay (VideoPlayer), so picking a style -- or toggling
 * captions on/off -- shows up in the preview immediately instead of only
 * being visible after exporting.
 */
export const useCaptionStyleStore = create<CaptionStyleStore>((set) => ({
  style: DEFAULT_CAPTION_STYLE,
  setStyle: (style) => set({ style }),
  burnInCaptions: false,
  setBurnInCaptions: (burnInCaptions) => set({ burnInCaptions }),
}));
