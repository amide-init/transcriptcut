import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateCaptions } from "@/lib/captions/generate";
import { toSrt, toVtt } from "@/lib/captions/format";
import type { Transcript } from "@/types/transcript";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/** Sidecar caption download -- GET /api/projects/:id/captions?format=srt|vtt */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "vtt" ? "vtt" : "srt";

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
  if (project.duration === null) {
    return errorResponse("NO_DURATION", "This project's video duration isn't known yet.", 400);
  }

  const transcript: Transcript = {
    id: project.transcript.id,
    segments: JSON.parse(project.transcript.segmentsJson),
  };
  const cuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");

  const cues = generateCaptions(transcript, cuts, project.duration);
  const body = format === "vtt" ? toVtt(cues) : toSrt(cues);
  const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": format === "vtt" ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
