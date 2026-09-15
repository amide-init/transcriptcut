import { create } from "zustand";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

type TimelineStore = {
  operations: EditOperation[];
  redoStack: EditOperation[];

  addCut: (start: number, end: number, reason?: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;

  cuts: () => CutOperation[];
};

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  operations: [],
  redoStack: [],

  addCut: (start, end, reason) => {
    if (end <= start) return;
    const op: CutOperation = {
      id: crypto.randomUUID(),
      type: "cut",
      start,
      end,
      reason,
      createdAt: Date.now(),
    };
    set((s) => ({ operations: [...s.operations, op], redoStack: [] }));
  },

  undo: () => {
    const { operations } = get();
    if (operations.length === 0) return;
    const last = operations[operations.length - 1];
    set((s) => ({
      operations: s.operations.slice(0, -1),
      redoStack: [...s.redoStack, last],
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const op = redoStack[redoStack.length - 1];
    set((s) => ({
      operations: [...s.operations, op],
      redoStack: s.redoStack.slice(0, -1),
    }));
  },

  reset: () => set({ operations: [], redoStack: [] }),

  cuts: () =>
    get().operations.filter((op): op is CutOperation => op.type === "cut"),
}));
