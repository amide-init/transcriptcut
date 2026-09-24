/**
 * Podcast publishing helpers: chapters and show notes.
 *
 * Duplicated in server/src/types/publishing.ts -- keep in sync.
 */

export type Chapter = {
  id: string;
  title: string;
  /**
   * Seconds on the *source* timeline, not the edited one, so transcript
   * edits made after generation don't shift chapters onto the wrong
   * moment. Mapped to edited time for display/export (lib/publishing/chapters.ts).
   */
  sourceStart: number;
};

/** A chapter as shown/exported: its position on the edited (post-cut) timeline. */
export type ResolvedChapter = Chapter & { start: number };

export type ShowNotes = {
  summary: string;
  keyPoints: string[];
  /** Title suggestions for the episode. */
  titles: string[];
};

export const EXPORT_FORMATS = ["mp4", "mp3", "wav"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Limits shared by AI output validation and user edits. */
export const CHAPTER_TITLE_MAX = 80;
export const MAX_CHAPTERS = 50;
/** Closer than this on the edited timeline and two chapters are merged -- YouTube also requires >= 10s. */
export const MIN_CHAPTER_SECONDS = 10;
