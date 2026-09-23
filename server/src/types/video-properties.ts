/**
 * Manual color-adjustment sliders, layered on top of the selected filter
 * preset (lib/video/filters.ts). Every value is a -100..100 percentage
 * around a neutral 0 (no change) -- matches how the sliders read on screen.
 */
export type VideoProperties = {
  saturation: number;
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
};

export const DEFAULT_VIDEO_PROPERTIES: VideoProperties = {
  saturation: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
};

export const VIDEO_PROPERTY_FIELDS: { key: keyof VideoProperties; label: string; section: "Color" | "Light" }[] = [
  { key: "saturation", label: "Saturation", section: "Color" },
  { key: "temperature", label: "Temperature", section: "Color" },
  { key: "tint", label: "Tint", section: "Color" },
  { key: "exposure", label: "Exposure", section: "Light" },
  { key: "contrast", label: "Contrast", section: "Light" },
  { key: "highlights", label: "Highlights", section: "Light" },
  { key: "shadows", label: "Shadows", section: "Light" },
];
