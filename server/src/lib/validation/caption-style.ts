import { z } from "zod";
import { CAPTION_FONTS, CAPTION_POSITIONS } from "@/lib/captions/style";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a '#RRGGBB' hex color.");

export const captionStyleSchema = z.object({
  font: z.enum(CAPTION_FONTS),
  /** Percent of frame height, not raw points -- see lib/captions/style.ts. */
  fontSize: z.number().min(1).max(8),
  textColor: hexColor,
  outlineColor: hexColor,
  position: z.enum(CAPTION_POSITIONS),
  background: z.boolean(),
  wordHighlight: z.boolean(),
  highlightColor: hexColor,
});
