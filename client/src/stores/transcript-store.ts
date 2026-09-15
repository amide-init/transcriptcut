import { create } from "zustand";
import type { Transcript } from "@/types/transcript";

type TranscriptStore = {
  transcript: Transcript | null;
  /** ids of words currently selected for deletion, in click order */
  selectedWordIds: string[];
  /** ids of words flagged as filler by the last detection pass */
  fillerWordIds: string[];
  detectingFillerWords: boolean;

  setTranscript: (transcript: Transcript | null) => void;
  toggleWordSelection: (wordId: string) => void;
  selectWordRange: (fromWordId: string, toWordId: string) => void;
  clearSelection: () => void;
  setFillerWordIds: (ids: string[]) => void;
  setDetectingFillerWords: (detecting: boolean) => void;
};

export const useTranscriptStore = create<TranscriptStore>((set, get) => ({
  transcript: null,
  selectedWordIds: [],
  fillerWordIds: [],
  detectingFillerWords: false,

  setTranscript: (transcript) => set({ transcript, selectedWordIds: [], fillerWordIds: [] }),

  toggleWordSelection: (wordId) =>
    set((s) => ({
      selectedWordIds: s.selectedWordIds.includes(wordId)
        ? s.selectedWordIds.filter((id) => id !== wordId)
        : [...s.selectedWordIds, wordId],
    })),

  selectWordRange: (fromWordId, toWordId) => {
    const { transcript } = get();
    if (!transcript) return;
    const allWords = transcript.segments.flatMap((seg) => seg.words);
    const fromIdx = allWords.findIndex((w) => w.id === fromWordId);
    const toIdx = allWords.findIndex((w) => w.id === toWordId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    set({ selectedWordIds: allWords.slice(lo, hi + 1).map((w) => w.id) });
  },

  clearSelection: () => set({ selectedWordIds: [] }),

  setFillerWordIds: (fillerWordIds) => set({ fillerWordIds }),
  setDetectingFillerWords: (detectingFillerWords) => set({ detectingFillerWords }),
}));
