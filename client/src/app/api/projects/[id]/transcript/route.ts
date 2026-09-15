import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { updateSpeakerSchema } from "@/lib/validation/transcript";
import type { Transcript } from "@/types/transcript";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse("NOT_FOUND", "This project has no transcript yet.", 404);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };
  return NextResponse.json({ success: true, transcript });
}

/** Assigns or clears the speaker label on one transcript segment. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = updateSpeakerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const record = await prisma.transcript.findUnique({ where: { projectId: id } });
  if (!record) {
    return errorResponse("NOT_FOUND", "This project has no transcript yet.", 404);
  }

  const transcript: Transcript = { id: record.id, segments: JSON.parse(record.segmentsJson) };
  const segment = transcript.segments.find((s) => s.id === parsed.data.segmentId);
  if (!segment) {
    return errorResponse("SEGMENT_NOT_FOUND", "That transcript segment doesn't exist.", 404);
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

  return NextResponse.json({ success: true, transcript });
}
