import { create } from "zustand";
import type { SceneSuggestion } from "@/lib/scenes/suggestions";
import type { SplitSource } from "@/types/edit-operation";

export type ReviewedSuggestion = SceneSuggestion & { key: string; keep: boolean };

type SceneSuggestionStore = {
  /** Suggestions awaiting review, or null when there's nothing to review. */
  suggestions: ReviewedSuggestion[] | null;
  /** Where they came from, recorded on the splits they become. */
  source: SplitSource;
  /** Shot changes from the last detection (source seconds), or null if never run. */
  shots: number[] | null;
  setSuggestions: (suggestions: SceneSuggestion[], source: SplitSource) => void;
  update: (key: string, patch: Partial<Pick<ReviewedSuggestion, "keep" | "title">>) => void;
  clear: () => void;
  setShots: (shots: number[] | null) => void;
};

/**
 * Scene suggestions under review and detected shot changes: shared by the
 * Scenes panel (review list) and the timeline (ghost markers). Nothing here
 * is an edit until the user applies it.
 */
export const useSceneSuggestionStore = create<SceneSuggestionStore>((set) => ({
  suggestions: null,
  source: "ai",
  shots: null,
  setSuggestions: (suggestions, source) =>
    set({ suggestions: suggestions.map((s, i) => ({ ...s, key: `${i}-${s.at}`, keep: true })), source }),
  update: (key, patch) =>
    set((state) => ({ suggestions: state.suggestions?.map((s) => (s.key === key ? { ...s, ...patch } : s)) ?? null })),
  clear: () => set({ suggestions: null }),
  setShots: (shots) => set({ shots }),
}));
