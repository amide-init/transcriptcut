/**
 * Maps a filter preset id (see lib/video/filters.ts, the browser CSS-filter
 * preview) to an equivalent FFmpeg video filter for the actual render.
 *
 * Not a guaranteed pixel-exact match to the CSS `filter` preview -- browser
 * CSS filters and FFmpeg's filter graph are different color pipelines with
 * no 1:1 mapping for everything (sepia()/hue-rotate() in particular have no
 * simple ffmpeg equivalent). Where an exact mapping IS available though,
 * it's used: `saturate()`/`contrast()` are verified exact matches to
 * `eq`'s `saturation`/`contrast` parameters, and CSS `brightness()` (a pure
 * multiplicative gain) is a verified exact match to the `exposure` filter's
 * `exposure` parameter (`2^exposure`) -- NOT to `eq`'s own `brightness`
 * parameter, which is *additive* (confirmed empirically: `eq=brightness=X`
 * adds a constant offset to every pixel, it doesn't scale them) and was
 * silently the wrong operation for the "brightness" presets below use.
 * (Both verified by rendering a test gradient through each ffmpeg filter
 * and sampling pixel values -- see GitHub issues #23/#24.)
 */
const FFMPEG_FILTERS: Record<string, string | null> = {
  none: null,
  // CSS: grayscale(1) contrast(1.05). hue=s=0 (zero chroma in YUV) isn't
  // the same desaturation algorithm as CSS grayscale()'s luminance matrix,
  // but the contrast term IS exact -- it was previously dropped entirely.
  bw: "hue=s=0,eq=contrast=1.05",
  // CSS: sepia(0.35) saturate(1.2) contrast(1.1) brightness(0.95). Left as
  // ffmpeg's own built-in vintage tone curve rather than composing the CSS
  // recipe's individual terms -- curves=preset=vintage is a distinct,
  // deliberately-designed LUT, not an approximation of the CSS formula, so
  // there's no single "more correct" mapping to converge toward here.
  vintage: "curves=preset=vintage",
  // CSS: sepia(0.18) saturate(1.3) brightness(1.05) contrast(1.05).
  // exposure=0.070 = log2(1.05), the exact match for brightness(1.05).
  warm: "colorbalance=rs=.2:gs=.05:bs=-.15,eq=saturation=1.3:contrast=1.05,exposure=exposure=0.070",
  // CSS: hue-rotate(-8deg) saturate(1.15) brightness(1.02) contrast(1.05).
  // brightness(1.02) was previously dropped entirely; exposure=0.029 =
  // log2(1.02) is its exact match.
  cool: "colorbalance=rs=-.15:gs=0:bs=.2,eq=saturation=1.15:contrast=1.05,exposure=exposure=0.029",
  // CSS: contrast(1.4) saturate(1.1). Already an exact match (no brightness term).
  contrast: "eq=contrast=1.4:saturation=1.1",
  // CSS: contrast(0.85) brightness(1.1) saturate(0.7).
  // exposure=0.138 = log2(1.1), the exact match for brightness(1.1).
  faded: "eq=contrast=0.85:saturation=0.7,exposure=exposure=0.138",
};

export function getFfmpegFilter(filterId: string): string | null {
  return FFMPEG_FILTERS[filterId] ?? null;
}
