import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { transcribeFile } from "@/lib/ai/transcribe";

export const runtime = "nodejs";

const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // Whisper API limit

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "original" } });
  if (!asset) {
    return errorResponse("NO_VIDEO", "Upload a video before transcribing.", 400);
  }
  if (asset.sizeBytes > MAX_TRANSCRIBE_BYTES) {
    return errorResponse(
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

    return NextResponse.json({ success: true, transcript });
  } catch (err) {
    console.error("Transcription failed:", err);
    return errorResponse(
      "TRANSCRIPTION_FAILED",
      "The video could not be transcribed. Please try again.",
      502
    );
  }
}
