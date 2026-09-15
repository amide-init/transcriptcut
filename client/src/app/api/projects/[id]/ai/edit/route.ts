import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { aiEditRequestSchema } from "@/lib/validation/ai-edit";
import { runEditAgent } from "@/agents/graph";
import type { Transcript } from "@/types/transcript";
import type { EditOperation, CutOperation } from "@/types/edit-operation";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = aiEditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { transcript: true, editOperations: true },
  });
  if (!project) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }
  if (!project.transcript) {
    return errorResponse("NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  }

  const transcript: Transcript = {
    id: project.transcript.id,
    segments: JSON.parse(project.transcript.segmentsJson),
  };
  const existingCuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");

  try {
    const result = await runEditAgent({
      userRequest: parsed.data.message,
      transcript,
      duration: project.duration,
      existingCuts,
    });

    if (!result.success) {
      return errorResponse("INVALID_EDIT_PLAN", result.error, 422);
    }

    return NextResponse.json({ success: true, intent: result.intent, operations: result.operations });
  } catch (err) {
    console.error("AI edit failed:", err);
    return errorResponse("AI_EDIT_FAILED", "The AI editor could not process this request. Please try again.", 502);
  }
}
