import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { detectFillerWords } from "@/lib/ai/filler-words";
import type { Transcript } from "@/types/transcript";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse("NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };

  try {
    const fillerWordIds = await detectFillerWords(transcript);
    return NextResponse.json({ success: true, fillerWordIds });
  } catch (err) {
    console.error("Filler word detection failed:", err);
    return errorResponse("DETECTION_FAILED", "Could not analyze the transcript for filler words.", 502);
  }
}
