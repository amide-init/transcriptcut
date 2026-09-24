import { z } from "zod";
import { EXPORT_FORMATS, MAX_CHAPTERS } from "@/types/publishing";

/** PUT /publishing/chapters -- the user's edited chapter list (titles are cleaned server-side). */
export const updateChaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().max(500),
        sourceStart: z.number().finite().min(0),
      })
    )
    .max(MAX_CHAPTERS),
});

/** PUT /publishing/show-notes -- user edits to generated notes. */
export const updateShowNotesSchema = z.object({
  summary: z.string().max(5000),
  keyPoints: z.array(z.string().max(500)).max(20),
  titles: z.array(z.string().max(200)).max(10),
});

export const exportFormatSchema = z.enum(EXPORT_FORMATS);
