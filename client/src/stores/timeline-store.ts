import { create } from "zustand";
import type { CutOperation, EditOperation, SplitOperation } from "@/types/edit-operation";

/**
 * One undoable step: the operations it added and the ones it removed.
 * Most steps only add (a cut, a split); replacing an op -- e.g. renaming a
 * scene, since ops are never mutated in place -- removes the old version
 * and adds the new one, and undo swaps them back.
 */
type HistoryEntry = { added: EditOperation[]; removed: EditOperation[] };

type TimelineStore = {
  projectId: string | null;
  operations: EditOperation[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  addCut: (start: number, end: number, reason?: string) => void;
  /** Several cuts as one undo step (e.g. "Remove all filler words"). */
  addCuts: (cuts: { start: number; end: number; reason?: string }[]) => void;
  /** Adds a scene boundary at a source time; callers snap it off words first (lib/timeline/scenes.ts). */
  addSplit: (timestamp: number, title?: string) => void;
  /** Adds several operations as one undo step (they share a groupId). */
  addOperations: (ops: EditOperation[]) => void;
  /** Swaps one operation for a new version of it, as one undo step. */
  replaceOperation: (operationId: string, next: EditOperation) => void;
  /**
   * Removes specific operations by id, regardless of where they sit in
   * history -- this lets a user restore one particular cut word/segment/
   * sentence directly. It's its own undo step, so an accidental restore
   * can be undone too.
   */
  removeOperations: (operationIds: string[]) => void;
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

function makeCut(start: number, end: number, reason?: string): CutOperation {
  return { id: crypto.randomUUID(), type: "cut", start, end, reason, createdAt: Date.now() };
}

/**
 * Rebuilds undo history from persisted ops, so undo still works after a
 * reload: each op is its own step, except ops sharing a groupId, which
 * undo together. Replacements can't be reconstructed (the old version is
 * gone), so after a reload undoing a rename removes the scene boundary --
 * the same thing undoing the original split would have done.
 */
function historyFromOperations(operations: EditOperation[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const op of operations) {
    const last = entries[entries.length - 1];
    if (op.groupId && last?.added[0]?.groupId === op.groupId) {
      last.added.push(op);
    } else {
      entries.push({ added: [op], removed: [] });
    }
  }
  return entries;
}

export const useTimelineStore = create<TimelineStore>((set, get) => {
  /** Applies a step's changes (or their inverse) to state and the server. */
  const apply = (added: EditOperation[], removed: EditOperation[]) => {
    const removedIds = new Set(removed.map((op) => op.id));
    set((s) => ({ operations: [...s.operations.filter((op) => !removedIds.has(op.id)), ...added] }));
    const { projectId } = get();
    for (const op of removed) deleteOperation(projectId, op.id);
    for (const op of added) persistOperation(projectId, op);
  };

  const commit = (entry: HistoryEntry) => {
    if (entry.added.length === 0 && entry.removed.length === 0) return;
    apply(entry.added, entry.removed);
    set((s) => ({ undoStack: [...s.undoStack, entry], redoStack: [] }));
  };

  return {
    projectId: null,
    operations: [],
    undoStack: [],
    redoStack: [],

    addCut: (start, end, reason) => {
      if (end <= start) return;
      commit({ added: [makeCut(start, end, reason)], removed: [] });
    },

    addCuts: (cuts) => {
      const valid = cuts.filter((c) => c.end > c.start);
      if (valid.length === 1) get().addCut(valid[0].start, valid[0].end, valid[0].reason);
      else get().addOperations(valid.map((c) => makeCut(c.start, c.end, c.reason)));
    },

    addSplit: (timestamp, title) => {
      const op: SplitOperation = {
        id: crypto.randomUUID(),
        type: "split",
        timestamp,
        source: "manual",
        createdAt: Date.now(),
        ...(title ? { title } : {}),
      };
      commit({ added: [op], removed: [] });
    },

    addOperations: (ops) => {
      if (ops.length === 0) return;
      const groupId = crypto.randomUUID();
      commit({ added: ops.map((op) => ({ ...op, groupId })), removed: [] });
    },

    replaceOperation: (operationId, next) => {
      const current = get().operations.find((op) => op.id === operationId);
      if (!current) return;
      commit({ added: [next], removed: [current] });
    },

    removeOperations: (operationIds) => {
      const idSet = new Set(operationIds);
      const toRemove = get().operations.filter((op) => idSet.has(op.id));
      commit({ added: [], removed: toRemove });
    },

    undo: () => {
      const entry = get().undoStack.at(-1);
      if (!entry) return;
      apply(entry.removed, entry.added);
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }));
    },

    redo: () => {
      const entry = get().redoStack.at(-1);
      if (!entry) return;
      apply(entry.added, entry.removed);
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, entry] }));
    },

    hydrate: (projectId, operations) =>
      set({ projectId, operations, undoStack: historyFromOperations(operations), redoStack: [] }),

    reset: () => set({ projectId: null, operations: [], undoStack: [], redoStack: [] }),

    cuts: () => get().operations.filter((op): op is CutOperation => op.type === "cut"),
  };
});
