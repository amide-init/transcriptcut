import { create } from "zustand";
import type { Transcript } from "@/types/transcript";
import type { SilenceGap } from "@/lib/timeline/silence";

type TranscriptStore = {
  transcript: Transcript | null;
  /** ids of words currently selected for deletion, in click order */
  selectedWordIds: string[];
  /** ids of words flagged as filler by the last detection pass */
  fillerWordIds: string[];
  detectingFillerWords: boolean;
  /** Gaps flagged by the last "Find long pauses" pass (AiToolsPanel), null = not run yet. */
  silenceGaps: SilenceGap[] | null;

  setTranscript: (transcript: Transcript | null) => void;
  toggleWordSelection: (wordId: string) => void;
  selectWordRange: (fromWordId: string, toWordId: string) => void;
  clearSelection: () => void;
  setFillerWordIds: (ids: string[]) => void;
  setDetectingFillerWords: (detecting: boolean) => void;
  setSilenceGaps: (gaps: SilenceGap[] | null) => void;
  /** Local-only update; persisting to the backend is the caller's job (see TranscriptPanel). */
  setSegmentSpeaker: (segmentId: string, speaker: string | null) => void;
};

export const useTranscriptStore = create<TranscriptStore>((set, get) => ({
  transcript: null,
  selectedWordIds: [],
  fillerWordIds: [],
  detectingFillerWords: false,
  silenceGaps: null,

  setTranscript: (transcript) =>
    set({ transcript, selectedWordIds: [], fillerWordIds: [], silenceGaps: null }),

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
  setSilenceGaps: (silenceGaps) => set({ silenceGaps }),

  setSegmentSpeaker: (segmentId, speaker) =>
    set((s) => {
      if (!s.transcript) return s;
      return {
        transcript: {
          ...s.transcript,
          segments: s.transcript.segments.map((seg) =>
            seg.id === segmentId ? { ...seg, speaker: speaker ?? undefined } : seg
          ),
        },
      };
    }),
}));
