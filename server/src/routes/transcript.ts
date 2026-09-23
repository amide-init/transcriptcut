import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { updateSpeakerSchema } from "@/lib/validation/transcript";
import { errorResponse } from "@/lib/http";
import type { Transcript } from "@/types/transcript";

export const transcriptRoute = new Hono();

transcriptRoute.get("/:id/transcript", async (c) => {
  const id = c.req.param("id");

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse(c, "NOT_FOUND", "This project has no transcript yet.", 404);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };
  return c.json({ success: true, transcript });
});

/** Assigns or clears the speaker label on one transcript segment. */
transcriptRoute.patch("/:id/transcript", async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = updateSpeakerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse(c, "NOT_FOUND", "This project has no transcript yet.", 404);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };
  const segment = transcript.segments.find((s) => s.id === parsed.data.segmentId);
  if (!segment) {
    return errorResponse(c, "SEGMENT_NOT_FOUND", "That transcript segment doesn't exist.", 404);
  }

  if (parsed.data.speaker === null) {
    delete segment.speaker;
  } else {
    segment.speaker = parsed.data.speaker;
  }

  await prisma.transcript.update({
    where: { projectId: id },
    data: { segmentsJson: JSON.stringify(transcript.segments) },
  });

  return c.json({ success: true, transcript });
});
