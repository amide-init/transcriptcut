/**
 * Clips / Shorts: short standalone excerpts rendered reframed with captions.
 *
 * Duplicated in server/src/types/clips.ts -- keep in sync.
 */

export const CLIP_ASPECTS = ["9:16", "1:1", "16:9"] as const;
export type ClipAspect = (typeof CLIP_ASPECTS)[number];

/** Output frame size per aspect: 1080p-class, the size Shorts/Reels/TikTok expect. */
export const CLIP_OUTPUT_SIZE: Record<ClipAspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export type Clip = {
  id: string;
  name: string;
  /** Seconds on the source timeline. */
  sourceStart: number;
  sourceEnd: number;
  aspect: ClipAspect;
  /** Horizontal crop position, 0 (left) .. 1 (right). */
  cropX: number;
  captions: boolean;
  source: "ai" | "manual";
  reason: string | null;
};

/** Edited (post-cut) length limits, in seconds. AI picks aim for the middle of this. */
export const CLIP_MIN_SECONDS = 5;
export const CLIP_MAX_SECONDS = 180;
export const HIGHLIGHT_MIN_SECONDS = 15;
export const HIGHLIGHT_MAX_SECONDS = 90;
export const MAX_HIGHLIGHTS = 8;
