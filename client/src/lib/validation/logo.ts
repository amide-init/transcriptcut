import { z } from "zod";
import { LOGO_PADDING_MAX_PERCENT, LOGO_PADDING_MIN_PERCENT, LOGO_POSITIONS } from "@/lib/video/logo";

/** Percent of frame width/height, not raw pixels -- see lib/video/logo.ts. */
const padding = z.number().min(LOGO_PADDING_MIN_PERCENT).max(LOGO_PADDING_MAX_PERCENT);
const opacity = z.number().int().min(0).max(100);

export const logoSettingsSchema = z.object({
  logoPosition: z.enum(LOGO_POSITIONS),
  logoPaddingX: padding,
  logoPaddingY: padding,
  logoOpacity: opacity,
});
