import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id, jobId } = await params;

  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Render job not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      error: job.error,
      downloadUrl: job.status === "completed" ? `/api/projects/${id}/render/${jobId}/download` : null,
    },
  });
}
