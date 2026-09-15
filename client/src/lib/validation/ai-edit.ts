import { z } from "zod";

export const aiEditRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});
