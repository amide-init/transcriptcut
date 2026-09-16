import { z } from "zod";

const pct = z.number().min(-100).max(100);

export const videoPropertiesSchema = z.object({
  saturation: pct,
  temperature: pct,
  tint: pct,
  exposure: pct,
  contrast: pct,
  highlights: pct,
  shadows: pct,
});
