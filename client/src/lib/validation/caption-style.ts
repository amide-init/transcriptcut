import { z } from "zod";
import { CAPTION_FONTS, CAPTION_POSITIONS } from "@/lib/captions/style";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a '#RRGGBB' hex color.");

export const captionStyleSchema = z.object({
  font: z.enum(CAPTION_FONTS),
  fontSize: z.number().int().min(10).max(72),
  textColor: hexColor,
  outlineColor: hexColor,
  position: z.enum(CAPTION_POSITIONS),
  background: z.boolean(),
});
