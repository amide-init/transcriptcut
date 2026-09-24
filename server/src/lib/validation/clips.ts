import { z } from "zod";
import { CLIP_ASPECTS, CLIP_MAX_SECONDS, CLIP_MIN_SECONDS } from "@/types/clips";

const name = z.string().trim().min(1).max(80);

export const createClipSchema = z
  .object({
    name: name.optional(),
    sourceStart: z.number().finite().min(0),
    sourceEnd: z.number().finite().min(0),
  })
  .refine((c) => c.sourceEnd - c.sourceStart >= CLIP_MIN_SECONDS, {
    message: `A clip must be at least ${CLIP_MIN_SECONDS} seconds long.`,
  })
  .refine((c) => c.sourceEnd - c.sourceStart <= CLIP_MAX_SECONDS, {
    message: `A clip can be at most ${CLIP_MAX_SECONDS / 60} minutes long.`,
  });

export const updateClipSchema = z
  .object({
    name,
    aspect: z.enum(CLIP_ASPECTS),
    cropX: z.number().finite().min(0).max(1),
    captions: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update." });
