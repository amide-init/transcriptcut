import { z } from "zod";
import { captionStyleSchema } from "@/lib/validation/caption-style";
import { videoPropertiesSchema } from "@/lib/validation/video-properties";
import { logoSettingsSchema } from "@/lib/validation/logo";
import { audioSettingsSchema } from "@/lib/validation/audio-settings";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/** PATCH /api/projects/:id — any subset of these fields. */
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    filterId: z.string().trim().min(1).max(50),
    duration: z.number().positive(),
    burnInCaptions: z.boolean(),
    /// Validated then re-serialized -- captionStyleJson is the actual Prisma column.
    captionStyle: captionStyleSchema,
    /// Validated then re-serialized -- propertiesJson is the actual Prisma column.
    properties: videoPropertiesSchema,
    /// Validated then re-serialized -- audioSettingsJson is the actual Prisma column.
    audioSettings: audioSettingsSchema,
    ...logoSettingsSchema.shape,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  })
  .transform(({ captionStyle, properties, audioSettings, ...rest }) => ({
    ...rest,
    ...(captionStyle !== undefined ? { captionStyleJson: JSON.stringify(captionStyle) } : {}),
    ...(properties !== undefined ? { propertiesJson: JSON.stringify(properties) } : {}),
    ...(audioSettings !== undefined ? { audioSettingsJson: JSON.stringify(audioSettings) } : {}),
  }));
