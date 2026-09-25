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
      /**
       * How the scene starting at `at` is joined to what plays before it
       * (its card, if it has one, included). At 0 it fades the episode in;
       * at the source duration it fades the episode out. Transitions never
       * change the program's length -- see lib/timeline/program.ts.
       */
      type: "transition";
      at: number;
      kind: TransitionKind;
      /** Seconds for the whole transition (a dip spends half going out, half coming in). */
      duration: number;
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

/**
 * dipBlack/dipWhite fade out to a color and back in; crossfade blends
 * straight into or out of a title card (it needs a card: blending two
 * stretches of footage that follow each other in the source shows nothing).
 */
export const TRANSITION_KINDS = ["dipBlack", "dipWhite", "crossfade"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
export const TRANSITION_MIN_SECONDS = 0.2;
export const TRANSITION_MAX_SECONDS = 2;

export type CutOperation = Extract<EditOperation, { type: "cut" }>;
export type SplitOperation = Extract<EditOperation, { type: "split" }>;
export type CardOperation = Extract<EditOperation, { type: "card" }>;
export type TransitionOperation = Extract<EditOperation, { type: "transition" }>;
