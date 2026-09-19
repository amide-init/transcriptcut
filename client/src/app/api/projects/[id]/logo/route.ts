import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { readAssetStream, statAsset, streamToWebReadable, writeAsset } from "@/lib/storage/local";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB local upload cap for a logo/watermark image

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "logo" } });
  if (!asset) {
    return errorResponse("NOT_FOUND", "No logo for this project.", 404);
  }

  const stats = await statAsset(asset.filePath);
  const stream = readAssetStream(asset.filePath);
  return new NextResponse(streamToWebReadable(stream), {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(stats.size),
    },
  });
}

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
  if (!file.type.startsWith("image/")) {
    return errorResponse("INVALID_FILE_TYPE", "Only image files are supported.", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { relativePath } = await writeAsset(id, "logo", file.name, bytes);

  // Only one logo per project -- replace any previous one.
  await prisma.asset.deleteMany({ where: { projectId: id, kind: "logo" } });
  const asset = await prisma.asset.create({
    data: {
      projectId: id,
      kind: "logo",
      filePath: relativePath,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  return NextResponse.json({
    success: true,
    asset,
    logoUrl: `/api/projects/${id}/logo`,
  });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "logo" } });
  if (!asset) {
    return errorResponse("NOT_FOUND", "No logo for this project.", 404);
  }

  await prisma.asset.delete({ where: { id: asset.id } });

  return NextResponse.json({ success: true });
}
