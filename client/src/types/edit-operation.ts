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
      /**
       * A full-screen title card inserted into the program -- time that
       * isn't in the source. `at` is the source time it plays before:
       * usually a scene boundary, 0 for an intro, or the source duration
       * for an outro. See lib/timeline/program.ts for placement.
       */
      type: "card";
      at: number;
      /** Seconds on screen. */
      duration: number;
      template: CardTemplate;
      title: string;
      subtitle?: string;
      /** '#RRGGBB' */
      background: string;
    })
  | (OperationBase & {
      type: "caption";
      text: string;
      start: number;
      end: number;
    });

export const CARD_TEMPLATES = ["title", "chapter", "quote", "outro"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];
export const CARD_MIN_SECONDS = 1;
export const CARD_MAX_SECONDS = 10;
export const CARD_TITLE_MAX = 80;
export const CARD_SUBTITLE_MAX = 120;

export type CutOperation = Extract<EditOperation, { type: "cut" }>;
export type SplitOperation = Extract<EditOperation, { type: "split" }>;
export type CardOperation = Extract<EditOperation, { type: "card" }>;
