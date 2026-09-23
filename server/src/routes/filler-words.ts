import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { detectFillerWords } from "@/lib/ai/filler-words";
import { errorResponse } from "@/lib/http";
import type { Transcript } from "@/types/transcript";

export const fillerWordsRoute = new Hono();

fillerWordsRoute.post("/:id/filler-words", async (c) => {
  const id = c.req.param("id");

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse(c, "NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };

  try {
    const fillerWordIds = await detectFillerWords(transcript);
    return c.json({ success: true, fillerWordIds });
  } catch (err) {
    console.error("Filler word detection failed:", err);
    return errorResponse(c, "DETECTION_FAILED", "Could not analyze the transcript for filler words.", 502);
  }
});
