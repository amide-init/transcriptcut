import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/** PATCH /api/projects/:id — any subset of these fields. */
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    filterId: z.string().trim().min(1).max(50),
    duration: z.number().positive(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });
