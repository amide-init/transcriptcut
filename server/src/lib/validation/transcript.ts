import { z } from "zod";

export const updateSpeakerSchema = z.object({
  segmentId: z.string().min(1),
  /** null clears the speaker assignment. */
  speaker: z.string().trim().min(1).max(100).nullable(),
});
