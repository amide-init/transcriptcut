import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { writeAsset } from "@/lib/storage/local";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB local upload cap

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return errorResponse("NOT_FOUND", "Project not found.", 404);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected multipart/form-data.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("MISSING_FILE", "No file was provided.", 400);
  }
  if (file.size === 0) {
    return errorResponse("EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      "FILE_TOO_LARGE",
      `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB upload limit.`,
      413
    );
  }
  if (!file.type.startsWith("video/")) {
    return errorResponse("INVALID_FILE_TYPE", "Only video files are supported.", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { relativePath } = await writeAsset(id, "original", file.name, bytes);

  // Only one "original" asset per project for v1 — replace any previous one.
  await prisma.asset.deleteMany({ where: { projectId: id, kind: "original" } });
  const asset = await prisma.asset.create({
    data: {
      projectId: id,
      kind: "original",
      filePath: relativePath,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  return NextResponse.json({
    success: true,
    asset,
    videoUrl: `/api/projects/${id}/video`,
  });
}
