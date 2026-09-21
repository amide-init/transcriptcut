import type { CSSProperties } from "react";

/**
 * Logo/watermark overlay anchor + padding, shared between the live preview
 * (VideoPlayer.tsx, positioned via CSS) and the export (ffmpeg/plan.ts,
 * positioned via an overlay filter expression) so the two always agree.
 */
export const LOGO_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const DEFAULT_LOGO_POSITION: LogoPosition = "bottom-right";
export const DEFAULT_LOGO_OPACITY = 100;

/**
 * Logo inset from the edge, as a percent of the frame's own width/height
 * (paddingX relative to frame width, paddingY relative to frame height) --
 * NOT raw pixels. A pixel value would mean something different in the
 * preview (CSS px against the on-screen, often-scaled-down player element)
 * than in the export (ffmpeg px against the video's native resolution), so
 * both logoPositionToCss and logoPositionToOverlayXY below take this same
 * frame-relative percent and let their own renderer (CSS %, ffmpeg's W/H
 * filtergraph variables) do the pixel conversion in its own coordinate
 * space -- see GitHub issue #21.
 */
export const DEFAULT_LOGO_PADDING_PERCENT = 3;
export const LOGO_PADDING_MIN_PERCENT = 0;
export const LOGO_PADDING_MAX_PERCENT = 20;

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

/**
 * CSS `top`/`bottom`/`left`/`right` (as `%` of the containing box, not px)
 * + `opacity` for absolutely positioning the logo over the video. `%` on an
 * absolutely-positioned element is already relative to its containing
 * block's own size, so this needs no measurement of the on-screen video
 * element -- the browser does the frame-relative math for free, the same
 * way ffmpeg's W/H variables do in logoPositionToOverlayXY below.
 */
export function logoPositionToCss(
  position: LogoPosition,
  paddingXPercent: number,
  paddingYPercent: number,
  opacity: number = DEFAULT_LOGO_OPACITY
): CSSProperties {
  const vertical = position.startsWith("top")
    ? { top: `${paddingYPercent}%` }
    : { bottom: `${paddingYPercent}%` };
  const horizontal = position.endsWith("left")
    ? { left: `${paddingXPercent}%` }
    : { right: `${paddingXPercent}%` };
  return { position: "absolute", ...vertical, ...horizontal, opacity: opacity / 100 };
}

/**
 * ffmpeg `overlay` filter x/y expressions for the same anchor + frame-
 * relative padding percent, using the standard W/H (base video) and w/h
 * (overlay) filtergraph variables so the position matches at any
 * resolution -- W*fraction is ffmpeg's own equivalent of CSS's `%`, so no
 * probed pixel dimensions are needed here (unlike the logo *size* fix,
 * where the scale filter has no access to the base video's W/H and needs
 * real numbers instead).
 */
export function logoPositionToOverlayXY(
  position: LogoPosition,
  paddingXPercent: number,
  paddingYPercent: number
): { x: string; y: string } {
  const fracX = (paddingXPercent / 100).toFixed(4);
  const fracY = (paddingYPercent / 100).toFixed(4);
  const x = position.endsWith("left") ? `(W*${fracX})` : `(W-w-W*${fracX})`;
  const y = position.startsWith("top") ? `(H*${fracY})` : `(H-h-H*${fracY})`;
  return { x, y };
}
