import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db/client";
import { readAssetStream, statAsset } from "@/lib/storage/local";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id, jobId } = await params;

  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });
  if (!job || job.projectId !== id || job.status !== "completed" || !job.outputPath) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_READY", message: "This render isn't ready to download." } },
      { status: 404 }
    );
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  const filename = `${(project?.name ?? "video").replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;

  const stats = await statAsset(job.outputPath);
  const stream = readAssetStream(job.outputPath);

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stats.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
