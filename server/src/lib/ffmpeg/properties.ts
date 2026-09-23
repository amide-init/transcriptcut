import type { VideoProperties } from "@/types/video-properties";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Maps the manual property sliders (Saturation/Temperature/Tint/Exposure/
 * Contrast/Highlights/Shadows) to an FFmpeg filter chain for export.
 * Saturation, contrast, and exposure are verified EXACT matches to the live
 * preview's CSS (lib/video/properties.ts#buildPropertiesCss); highlights is
 * a verified exact match to the preview's SVG filter
 * (buildPropertiesSvgValues in the same file) -- all confirmed empirically
 * by rendering a test gradient through each filter and sampling pixels, not
 * just assumed from docs (GitHub issue #23). Shadows and temperature/tint
 * remain approximate on the preview side (see buildPropertiesSvgValues'
 * doc comment for why) even though this export path uses the "real" tonal
 * filters -- `colorlevels` for highlights, `colortemperature`/
 * `colorbalance` for temperature/tint.
 *
 * Returns null when every property is at its neutral (0) value, so callers
 * can skip adding a filter step entirely.
 */
export function buildPropertiesFilter(props: VideoProperties): string | null {
  const parts: string[] = [];

  if (props.saturation !== 0 || props.contrast !== 0) {
    const saturation = clamp(1 + props.saturation / 100, 0, 3);
    const contrast = clamp(1 + props.contrast / 100, 0, 3);
    parts.push(`eq=saturation=${saturation.toFixed(3)}:contrast=${contrast.toFixed(3)}`);
  }

  if (props.exposure !== 0 || props.shadows !== 0) {
    const exposure = clamp(props.exposure / 100, -3, 3);
    // Verified empirically (rendered a test gradient through the exposure
    // filter and sampled pixels): a POSITIVE black value CRUSHES shadows
    // (raises the input black point, clipping more of the low end to
    // pure black), not lifts them. Negated here so a positive shadows
    // slider lifts/brightens shadows, matching the conventional direction
    // (and the live preview's shadows control) instead of the opposite.
    const black = clamp(-props.shadows / 300, -1, 1);
    parts.push(`exposure=exposure=${exposure.toFixed(3)}:black=${black.toFixed(3)}`);
  }

  if (props.highlights > 0) {
    // Lowering the input white point below 1 pushes more of the image
    // toward white, brightening/expanding highlights.
    const imax = clamp(1 - props.highlights / 250, 0.4, 1);
    parts.push(`colorlevels=rimax=${imax.toFixed(3)}:gimax=${imax.toFixed(3)}:bimax=${imax.toFixed(3)}`);
  } else if (props.highlights < 0) {
    // colorlevels' imax can't go above 1 -- ffmpeg rejects it ("out of
    // range [-1 - 1]") -- so compressing highlights can't be done by
    // raising the input white point. Lowering the *output* white point
    // instead caps how bright any pixel can end up, which compresses
    // highlights the same way, and stays valid for the whole slider range.
    const omax = clamp(1 + props.highlights / 250, 0.4, 1);
    parts.push(`colorlevels=romax=${omax.toFixed(3)}:gomax=${omax.toFixed(3)}:bomax=${omax.toFixed(3)}`);
  }

  if (props.temperature !== 0) {
    // Lower Kelvin = warmer output, matching "positive slider = warmer".
    const kelvin = clamp(6500 - props.temperature * 20, 1000, 40000);
    parts.push(`colortemperature=temperature=${kelvin.toFixed(0)}`);
  }

  if (props.tint !== 0) {
    // Green/magenta axis on midtones only, so it doesn't fight the shadow/highlight filters above.
    const mid = clamp(props.tint / 300, -1, 1);
    parts.push(`colorbalance=rm=${mid.toFixed(3)}:gm=${(-mid).toFixed(3)}:bm=${mid.toFixed(3)}`);
  }

  return parts.length > 0 ? parts.join(",") : null;
}
