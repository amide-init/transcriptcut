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
