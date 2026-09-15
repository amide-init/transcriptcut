import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; operationId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id: projectId, operationId } = await params;

  const op = await prisma.editOperation.findUnique({ where: { id: operationId } });
  if (!op || op.projectId !== projectId) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Operation not found." } },
      { status: 404 }
    );
  }

  await prisma.editOperation.delete({ where: { id: operationId } });
  return NextResponse.json({ success: true });
}
