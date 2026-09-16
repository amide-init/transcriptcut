import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { deleteProjectDir } from "@/lib/storage/local";
import { updateProjectSchema } from "@/lib/validation/project";
import type { Transcript } from "@/types/transcript";
import type { EditOperation } from "@/types/edit-operation";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assets: true,
      transcript: true,
      editOperations: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }

  const transcript: Transcript | null = project.transcript
    ? { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) }
    : null;

  const operations: EditOperation[] = project.editOperations.map(
    (op) => JSON.parse(op.dataJson) as EditOperation
  );

  const originalAsset = project.assets.find((a) => a.kind === "original") ?? null;

  return NextResponse.json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
      duration: project.duration,
      filterId: project.filterId,
      burnInCaptions: project.burnInCaptions,
      captionStyle: project.captionStyleJson ? JSON.parse(project.captionStyleJson) : null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    transcript,
    operations,
    videoUrl: originalAsset ? `/api/projects/${project.id}/video` : null,
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid update.", 400);
  }

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }

  const project = await prisma.project.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ success: true, project });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }

  await prisma.project.delete({ where: { id } });
  await deleteProjectDir(id);

  return NextResponse.json({ success: true });
}
