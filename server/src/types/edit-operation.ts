/**
 * Fields every operation shares. `groupId` ties together ops created by one
 * user action (e.g. applying a batch of suggested scenes) so undo/redo can
 * treat them as a single step.
 */
type OperationBase = {
  id: string;
  createdAt: number;
  groupId?: string;
};

/** Where a scene boundary came from -- shown in the UI, never changes behavior. */
export type SplitSource = "manual" | "ai" | "shot";

export type EditOperation =
  | (OperationBase & {
      type: "cut";
      start: number;
      end: number;
      reason?: string;
    })
  | (OperationBase & {
      type: "trim";
      start: number;
      end: number;
    })
  | (OperationBase & {
      /**
       * A scene boundary in source time. Splits don't change what's
       * rendered; they divide the episode into named scenes that cuts,
       * cards and transitions attach to.
       */
      type: "split";
      timestamp: number;
      title?: string;
      source?: SplitSource;
    })
  | (OperationBase & {
      type: "caption";
      text: string;
      start: number;
      end: number;
    });

export type CutOperation = Extract<EditOperation, { type: "cut" }>;
export type SplitOperation = Extract<EditOperation, { type: "split" }>;
