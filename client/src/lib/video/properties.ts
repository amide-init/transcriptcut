import type { VideoProperties } from "@/types/video-properties";

/**
 * Approximates the manual property sliders as a browser CSS `filter` string,
 * for the live preview -- combined with the selected preset's own css (see
 * lib/video/filters.ts). Browser CSS filters have no dedicated
 * highlights/shadows/tint primitives, so those are approximated via
 * brightness/contrast/hue-rotate; the FFmpeg export (lib/ffmpeg/properties.ts)
 * uses proper tonal-range filters and will look more accurate than this
 * preview for those three.
 */
export function buildPropertiesCss(props: VideoProperties): string {
  const parts: string[] = [];

  const saturation = 1 + props.saturation / 100;
  if (saturation !== 1) parts.push(`saturate(${Math.max(0, saturation).toFixed(3)})`);

  const brightness = 1 + (props.exposure + props.highlights * 0.3) / 100;
  if (brightness !== 1) parts.push(`brightness(${Math.max(0, brightness).toFixed(3)})`);

  const contrast = 1 + (props.contrast - props.shadows * 0.2) / 100;
  if (contrast !== 1) parts.push(`contrast(${Math.max(0, contrast).toFixed(3)})`);

  const hue = props.tint * 0.3 - props.temperature * 0.4;
  if (hue !== 0) parts.push(`hue-rotate(${hue.toFixed(2)}deg)`);

  if (props.temperature > 0) parts.push(`sepia(${Math.min(1, props.temperature / 150).toFixed(3)})`);

  return parts.join(" ");
}
