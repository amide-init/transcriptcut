import { create } from "zustand";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

type TimelineStore = {
  projectId: string | null;
  operations: EditOperation[];
  redoStack: EditOperation[];

  addCut: (start: number, end: number, reason?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Load persisted operations for a project (editor page on mount). */
  hydrate: (projectId: string, operations: EditOperation[]) => void;
  reset: () => void;

  cuts: () => CutOperation[];
};

function persistOperation(projectId: string | null, op: EditOperation) {
  if (!projectId) return;
  fetch(`/api/projects/${projectId}/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(op),
  }).catch((err) => console.error("Failed to persist operation:", err));
}

function deleteOperation(projectId: string | null, operationId: string) {
  if (!projectId) return;
  fetch(`/api/projects/${projectId}/operations/${operationId}`, { method: "DELETE" }).catch((err) =>
    console.error("Failed to delete operation:", err)
  );
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  projectId: null,
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
    persistOperation(get().projectId, op);
  },

  undo: () => {
    const { operations, projectId } = get();
    if (operations.length === 0) return;
    const last = operations[operations.length - 1];
    set((s) => ({
      operations: s.operations.slice(0, -1),
      redoStack: [...s.redoStack, last],
    }));
    deleteOperation(projectId, last.id);
  },

  redo: () => {
    const { redoStack, projectId } = get();
    if (redoStack.length === 0) return;
    const op = redoStack[redoStack.length - 1];
    set((s) => ({
      operations: [...s.operations, op],
      redoStack: s.redoStack.slice(0, -1),
    }));
    persistOperation(projectId, op);
  },

  hydrate: (projectId, operations) => set({ projectId, operations, redoStack: [] }),

  reset: () => set({ projectId: null, operations: [], redoStack: [] }),

  cuts: () =>
    get().operations.filter((op): op is CutOperation => op.type === "cut"),
}));
