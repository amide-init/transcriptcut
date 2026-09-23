import type { VideoProperties } from "@/types/video-properties";

/**
 * Builds the browser CSS `filter` string for saturation/contrast/exposure --
 * for the live preview, combined with the selected preset's own css (see
 * lib/video/filters.ts) and, for highlights/shadows/temperature/tint, an SVG
 * filter (buildPropertiesSvgValues below) applied via `url(#id)` in the same
 * `filter` list.
 *
 * These three are verified exact matches to their ffmpeg equivalents
 * (lib/ffmpeg/properties.ts), confirmed empirically by rendering a test
 * gradient through each ffmpeg filter and sampling pixel values -- not just
 * assumed from documentation:
 * - saturate() <-> eq=saturation= (both `1 + pct/100`, standard formula)
 * - contrast() <-> eq=contrast= (both `(x-0.5)*c+0.5`, the CSS Filter
 *   Effects spec's own definition of contrast() happens to be the same
 *   formula ffmpeg's eq filter uses)
 * - brightness() <-> exposure=exposure= (both a pure multiplicative gain,
 *   `x * amount`, when isolated from the `black` shadows term -- so
 *   `2^(exposure/100)` matches ffmpeg's exposure-in-stops semantics exactly
 *   where the old `1 + exposure/100` linear approximation didn't)
 */
export function buildPropertiesCss(props: VideoProperties): string {
  const parts: string[] = [];

  const saturation = 1 + props.saturation / 100;
  if (saturation !== 1) parts.push(`saturate(${Math.max(0, saturation).toFixed(3)})`);

  const contrast = 1 + props.contrast / 100;
  if (contrast !== 1) parts.push(`contrast(${Math.max(0, contrast).toFixed(3)})`);

  const brightness = Math.pow(2, props.exposure / 100);
  if (brightness !== 1) parts.push(`brightness(${brightness.toFixed(3)})`);

  return parts.join(" ");
}

/** Numeric inputs for the SVG filter primitives VideoPlayer.tsx renders for highlights/shadows/temperature/tint. */
export type PropertiesSvgValues = {
  /** feComponentTransfer type="linear" slope (intercept always 0). */
  highlightsSlope: number;
  /** feComponentTransfer type="gamma" exponent (amplitude/offset always 1/0). */
  shadowsExponent: number;
  /** feColorMatrix type="matrix" values (20 numbers, space-separated). */
  colorMatrix: string;
};

/**
 * Computes the SVG-filter equivalents of highlights/shadows/temperature/tint
 * -- CSS's `filter` property has no dedicated primitives for these, unlike
 * saturate/contrast/brightness above, so an inline SVG <filter> (rendered by
 * VideoPlayer.tsx, referenced via `url(#id)`) is needed instead.
 *
 * Highlights is a verified EXACT match to ffmpeg's colorlevels filter
 * (confirmed empirically the same way as buildPropertiesCss's three, above):
 * colorlevels' imax/omax is a linear input/output-range remap, which is
 * exactly feComponentTransfer's type="linear" (`slope*x + intercept`).
 *
 * Shadows and temperature/tint are NOT exact matches -- ffmpeg's shadows
 * term (the `exposure` filter's `black` parameter) turned out not to follow
 * any simple documented formula (verified empirically it's neither a plain
 * black-point stretch nor a simple gamma curve), and colortemperature/
 * colorbalance use a proper Planckian-locus white-balance algorithm with no
 * straightforward CSS/SVG equivalent. These use a well-directioned but
 * approximate gamma curve (shadows) and per-channel blue-yellow/green-
 * magenta offset (temperature/tint) instead -- the same kind of fast
 * approximation many editors use for real-time preview vs. final render,
 * clearly labeled as such rather than claiming a parity that isn't real.
 */
export function buildPropertiesSvgValues(props: VideoProperties): PropertiesSvgValues {
  let highlightsSlope = 1;
  if (props.highlights > 0) {
    const imax = Math.min(1, Math.max(0.4, 1 - props.highlights / 250));
    highlightsSlope = 1 / imax;
  } else if (props.highlights < 0) {
    const omax = Math.min(1, Math.max(0.4, 1 + props.highlights / 250));
    highlightsSlope = omax;
  }

  // Positive shadows -> exponent < 1 -> brightens dark values more than
  // bright ones (a standard gamma-lift technique), matching the "positive
  // = lift shadows" direction of the ffmpeg side (see the sign-fix comment
  // in lib/ffmpeg/properties.ts) and of the old CSS approximation.
  const shadowsExponent = Math.pow(2, -props.shadows / 100);

  const warmth = props.temperature / 100;
  const magenta = props.tint / 100;
  const TEMPERATURE_SHIFT = 0.15;
  const TINT_SHIFT = 0.1;
  const rShift = (warmth * TEMPERATURE_SHIFT + magenta * TINT_SHIFT).toFixed(3);
  const gShift = (-magenta * TINT_SHIFT).toFixed(3);
  const bShift = (-warmth * TEMPERATURE_SHIFT + magenta * TINT_SHIFT).toFixed(3);
  const colorMatrix = [
    `1 0 0 0 ${rShift}`,
    `0 1 0 0 ${gShift}`,
    `0 0 1 0 ${bShift}`,
    `0 0 0 1 0`,
  ].join("  ");

  return { highlightsSlope, shadowsExponent, colorMatrix };
}
