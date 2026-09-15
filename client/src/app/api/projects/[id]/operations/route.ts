import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { editOperationSchema } from "@/lib/validation/edit-operation";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id: projectId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = editOperationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_OPERATION",
      parsed.error.issues[0]?.message ?? "Invalid edit operation.",
      400
    );
  }

  const op = parsed.data;
  if ((op.type === "cut" || op.type === "trim") && op.end <= op.start) {
    return errorResponse("INVALID_OPERATION", "end must be after start.", 400);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }

  // Client generates the id (needed so undo/redo can address the exact row);
  // upsert so a redo that restores a previously-undone op is idempotent.
  const saved = await prisma.editOperation.upsert({
    where: { id: op.id },
    create: { id: op.id, projectId, type: op.type, dataJson: JSON.stringify(op) },
    update: { dataJson: JSON.stringify(op) },
  });

  return NextResponse.json({ success: true, operation: JSON.parse(saved.dataJson) }, { status: 201 });
}
