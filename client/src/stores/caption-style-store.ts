import { create } from "zustand";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/captions/style";

type CaptionStyleStore = {
  projectId: string | null;
  style: CaptionStyle;
  /** Mirrors the "Burn in captions" checkbox -- also gates the live preview overlay, so what you see while editing matches what export will produce. */
  burnInCaptions: boolean;

  /** Updates local state and persists to the backend (fire-and-forget), like useProjectStore#setFilterId. */
  setStyle: (style: CaptionStyle) => void;
  setBurnInCaptions: (burnInCaptions: boolean) => void;
  /** Load a persisted project's caption settings (editor page on mount) -- does not re-persist. */
  hydrate: (projectId: string, burnInCaptions: boolean, style: CaptionStyle | null) => void;
};

/**
 * Shared between the sidebar's CaptionsPanel and
 * the live preview overlay (VideoPlayer), so picking a style -- or toggling
 * captions on/off -- shows up in the preview immediately instead of only
 * being visible after exporting. Persisted per-project (like filterId in
 * useProjectStore) so it survives a page reload instead of resetting.
 */
export const useCaptionStyleStore = create<CaptionStyleStore>((set, get) => ({
  projectId: null,
  style: DEFAULT_CAPTION_STYLE,
  burnInCaptions: false,

  setStyle: (style) => {
    set({ style });
    const { projectId } = get();
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captionStyle: style }),
    }).catch((err) => console.error("Failed to persist caption style:", err));
  },

  setBurnInCaptions: (burnInCaptions) => {
    set({ burnInCaptions });
    const { projectId } = get();
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ burnInCaptions }),
    }).catch((err) => console.error("Failed to persist burn-in-captions flag:", err));
  },

  hydrate: (projectId, burnInCaptions, style) =>
    set({ projectId, burnInCaptions, style: style ?? DEFAULT_CAPTION_STYLE }),
}));
