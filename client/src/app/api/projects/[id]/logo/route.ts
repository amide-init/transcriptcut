import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { readAssetStream, statAsset, streamToWebReadable, writeAsset } from "@/lib/storage/local";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB local upload cap for a logo/watermark image

// Raster formats only -- the logo is fed straight into ffmpeg's filtergraph
// as an -i input (see lib/ffmpeg/plan.ts), and this build of ffmpeg has no
// SVG decoder (no librsvg), so an SVG upload previews fine in the browser
// but fails the export with "no decoder found for: svg".
const SUPPORTED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
  if (!SUPPORTED_LOGO_MIME_TYPES.has(file.type)) {
    return errorResponse(
      "INVALID_FILE_TYPE",
      "Only PNG, JPG, WEBP, or GIF images are supported (SVG can't be rendered into the export).",
      400
    );
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
