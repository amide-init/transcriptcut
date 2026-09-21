import type { CSSProperties } from "react";

/**
 * Logo/watermark overlay anchor + padding, shared between the live preview
 * (VideoPlayer.tsx, positioned via CSS) and the export (ffmpeg/plan.ts,
 * positioned via an overlay filter expression) so the two always agree.
 */
export const LOGO_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const DEFAULT_LOGO_POSITION: LogoPosition = "bottom-right";
export const DEFAULT_LOGO_PADDING = 16;
export const DEFAULT_LOGO_OPACITY = 100;

/**
 * Max logo size relative to the video frame, preserving aspect ratio and
 * never upscaling past the source image's native size. Keep in sync with
 * VideoPlayer.tsx's `max-w-[25%] max-h-[15%]` classes -- the ffmpeg export
 * (ffmpeg/plan.ts) applies the same fractions via a `scale` filter so the
 * exported logo size matches what was shown in the live preview.
 */
export const LOGO_MAX_WIDTH_FRACTION = 0.25;
export const LOGO_MAX_HEIGHT_FRACTION = 0.15;

/** Narrows the raw `Project.logoPosition` DB string (always app-written, but typed as `string` by Prisma) to `LogoPosition`. */
export function toLogoPosition(value: string): LogoPosition {
  return (LOGO_POSITIONS as readonly string[]).includes(value)
    ? (value as LogoPosition)
    : DEFAULT_LOGO_POSITION;
}

/** CSS `top`/`bottom`/`left`/`right` (px) + `opacity` for absolutely positioning the logo over the video. */
export function logoPositionToCss(
  position: LogoPosition,
  paddingX: number,
  paddingY: number,
  opacity: number = DEFAULT_LOGO_OPACITY
): CSSProperties {
  const vertical = position.startsWith("top") ? { top: paddingY } : { bottom: paddingY };
  const horizontal = position.endsWith("left") ? { left: paddingX } : { right: paddingX };
  return { position: "absolute", ...vertical, ...horizontal, opacity: opacity / 100 };
}

/**
 * ffmpeg `overlay` filter x/y expressions for the same anchor + padding,
 * using the standard W/H (base video) and w/h (overlay) filtergraph
 * variables so the position matches at any resolution.
 */
export function logoPositionToOverlayXY(
  position: LogoPosition,
  paddingX: number,
  paddingY: number
): { x: string; y: string } {
  const x = position.endsWith("left") ? `${paddingX}` : `W-w-${paddingX}`;
  const y = position.startsWith("top") ? `${paddingY}` : `H-h-${paddingY}`;
  return { x, y };
}
