import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { transcribeFile } from "@/lib/ai/transcribe";
import { errorResponse } from "@/lib/http";

export const transcribeRoute = new Hono();

const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // Whisper API limit

transcribeRoute.post("/:id/transcribe", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "original" } });
  if (!asset) {
    return errorResponse(c, "NO_VIDEO", "Upload a video before transcribing.", 400);
  }
  if (asset.sizeBytes > MAX_TRANSCRIBE_BYTES) {
    return errorResponse(
      c,
      "FILE_TOO_LARGE",
      `Video exceeds the ${MAX_TRANSCRIBE_BYTES / (1024 * 1024)}MB transcription limit.`,
      413
    );
  }

  try {
    const bytes = await readFile(resolveInDataDir(asset.filePath));
    const file = new File([new Uint8Array(bytes)], path.basename(asset.filePath), {
      type: asset.mimeType,
    });

    const transcript = await transcribeFile(file);

    await prisma.transcript.upsert({
      where: { projectId: id },
      create: { projectId: id, segmentsJson: JSON.stringify(transcript.segments) },
      update: { segmentsJson: JSON.stringify(transcript.segments) },
    });

    return c.json({ success: true, transcript });
  } catch (err) {
    console.error("Transcription failed:", err);
    return errorResponse(c, "TRANSCRIPTION_FAILED", "The video could not be transcribed. Please try again.", 502);
  }
});
