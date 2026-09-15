import type { FilterPreset } from "@/types/filter";

/**
 * Preview-only visual presets, applied as a CSS `filter` on the video
 * element — not baked into the source. Actual rendering still runs
 * through FFmpeg at export time (not yet implemented), so these never
 * touch the underlying file directly.
 */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", label: "None", css: "none" },
  { id: "bw", label: "Black & white", css: "grayscale(1) contrast(1.05)" },
  {
    id: "vintage",
    label: "Vintage",
    css: "sepia(0.35) saturate(1.2) contrast(1.1) brightness(0.95)",
  },
  {
    id: "warm",
    label: "Warm",
    css: "sepia(0.18) saturate(1.3) brightness(1.05) contrast(1.05)",
  },
  {
    id: "cool",
    label: "Cool",
    css: "hue-rotate(-8deg) saturate(1.15) brightness(1.02) contrast(1.05)",
  },
  { id: "contrast", label: "High contrast", css: "contrast(1.4) saturate(1.1)" },
  { id: "faded", label: "Faded", css: "contrast(0.85) brightness(1.1) saturate(0.7)" },
];

export function getFilterPreset(id: string): FilterPreset {
  return FILTER_PRESETS.find((p) => p.id === id) ?? FILTER_PRESETS[0];
}
