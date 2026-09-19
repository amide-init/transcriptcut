import { z } from "zod";
import { LOGO_POSITIONS } from "@/lib/video/logo";

const padding = z.number().int().min(0).max(200);

export const logoSettingsSchema = z.object({
  logoPosition: z.enum(LOGO_POSITIONS),
  logoPaddingX: padding,
  logoPaddingY: padding,
});
