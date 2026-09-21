/**
 * Maps a filter preset id (see lib/video/filters.ts, the browser CSS-filter
 * preview) to an equivalent FFmpeg video filter for the actual render.
 *
 * Not a guaranteed pixel-exact match to the CSS `filter` preview -- browser
 * CSS filters and FFmpeg's filter graph are different color pipelines with
 * no 1:1 mapping for everything (hue-rotate() in particular has no simple
 * ffmpeg equivalent, and colorbalance's "warmth" tint below has no CSS
 * counterpart to be exact *to*). Where an exact mapping IS available
 * though, it's used -- all verified by rendering real test colors (not
 * just a grayscale ramp, which can't reveal a per-channel-vs-luma
 * difference) through each ffmpeg filter and comparing pixel values against
 * the CSS Filter Effects spec's own formulas, run live in a browser via
 * canvas + getImageData:
 *
 * - CSS `brightness()` (pure multiplicative gain) <-> the `exposure`
 *   filter's `exposure` parameter (`2^exposure`) -- exact. NOT `eq`'s own
 *   `brightness`, which is *additive* (confirmed: `eq=brightness=X` adds a
 *   constant offset, it doesn't scale).
 * - CSS `contrast()` (`(x-0.5)*c+0.5` per R/G/B channel) <-> a `lut`
 *   filter applying that same expression to r/g/b -- exact. NOT `eq`'s own
 *   `contrast`, which turns out to only affect *luma* (Y in YUV), leaving
 *   chroma (color balance) almost untouched -- invisible on a grayscale
 *   test image (R=G=B, so luma-only vs per-channel look identical), but a
 *   real mismatch on colored footage. `eq=contrast` was previously assumed
 *   exact based on grayscale-only testing; corrected here.
 * - CSS `sepia(amount)`'s fixed 3x3 matrix (interpolated toward identity by
 *   `amount`, per the CSS spec) <-> `colorchannelmixer` with that same
 *   matrix -- exact, and composes with CSS `saturate(s)`'s own 3x3 matrix
 *   (also per spec) by ordinary matrix multiplication into ONE
 *   colorchannelmixer call, avoiding `eq`'s `saturation` (which -- like its
 *   `contrast` -- goes through a YUV round-trip and isn't quite exact on
 *   colored pixels, off by a few units per channel; not worth chasing
 *   further where no other filter component already needs colorchannelmixer).
 */
const FFMPEG_FILTERS: Record<string, string | null> = {
  none: null,
  // CSS: grayscale(1) contrast(1.05). hue=s=0 (zero chroma in YUV) isn't
  // the same desaturation algorithm as CSS grayscale()'s luminance matrix,
  // but the contrast term is now exact via `lut` (see doc comment above).
  bw: "hue=s=0,lut=r='(val-127.5)*1.05+127.5':g='(val-127.5)*1.05+127.5':b='(val-127.5)*1.05+127.5'",
  // CSS: sepia(0.35) saturate(1.2) contrast(1.1) brightness(0.95). Composed
  // from the verified-exact building blocks above instead of ffmpeg's
  // unrelated built-in `curves=preset=vintage` LUT, which was a distinct
  // "look" with no connection to the CSS recipe's actual parameters. The
  // colorchannelmixer values are sepia(0.35)'s matrix and saturate(1.2)'s
  // matrix multiplied together (sepia applied first, matching CSS's
  // left-to-right filter order); exposure=-0.074 = log2(0.95) for
  // brightness(0.95).
  vintage:
    "colorchannelmixer=rr=0.89267:rg=0.18154:rb=0.05813:gr=0.09419:gg=0.92668:gb=0.04931:br=0.06185:bg=0.08284:bb=0.81377,lut=r='(val-127.5)*1.1+127.5':g='(val-127.5)*1.1+127.5':b='(val-127.5)*1.1+127.5',exposure=exposure=-0.074",
  // CSS: sepia(0.18) saturate(1.3) brightness(1.05) contrast(1.05).
  // exposure=0.070 = log2(1.05), the exact match for brightness(1.05).
  warm: "colorbalance=rs=.2:gs=.05:bs=-.15,eq=saturation=1.3,lut=r='(val-127.5)*1.05+127.5':g='(val-127.5)*1.05+127.5':b='(val-127.5)*1.05+127.5',exposure=exposure=0.070",
  // CSS: hue-rotate(-8deg) saturate(1.15) brightness(1.02) contrast(1.05).
  // brightness(1.02) was previously dropped entirely; exposure=0.029 =
  // log2(1.02) is its exact match.
  cool: "colorbalance=rs=-.15:gs=0:bs=.2,eq=saturation=1.15,lut=r='(val-127.5)*1.05+127.5':g='(val-127.5)*1.05+127.5':b='(val-127.5)*1.05+127.5',exposure=exposure=0.029",
  // CSS: contrast(1.4) saturate(1.1). No brightness term to convert.
  contrast: "eq=saturation=1.1,lut=r='(val-127.5)*1.4+127.5':g='(val-127.5)*1.4+127.5':b='(val-127.5)*1.4+127.5'",
  // CSS: contrast(0.85) brightness(1.1) saturate(0.7).
  // exposure=0.138 = log2(1.1), the exact match for brightness(1.1).
  faded: "eq=saturation=0.7,lut=r='(val-127.5)*0.85+127.5':g='(val-127.5)*0.85+127.5':b='(val-127.5)*0.85+127.5',exposure=exposure=0.138",
};

export function getFfmpegFilter(filterId: string): string | null {
  return FFMPEG_FILTERS[filterId] ?? null;
}
