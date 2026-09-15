import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { runRenderJob } from "@/lib/ffmpeg/render-job";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  let burnInCaptions = false;
  try {
    const body = await request.json();
    burnInCaptions = body?.burnInCaptions === true;
  } catch {
    // No body (or invalid JSON) just means "no captions" -- not an error.
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { assets: true },
  });
  if (!project) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }
  if (!project.assets.some((a) => a.kind === "original")) {
    return errorResponse("NO_VIDEO", "This project has no video to render.", 400);
  }

  const job = await prisma.renderJob.create({
    data: { projectId: id, status: "queued" },
  });

  // Fire-and-forget: never block the request on FFmpeg (spec section 14).
  void runRenderJob(job.id, { burnInCaptions });

  return NextResponse.json({ success: true, jobId: job.id }, { status: 202 });
}
