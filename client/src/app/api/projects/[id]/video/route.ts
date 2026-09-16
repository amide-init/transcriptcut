import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { readAssetStream, statAsset, streamToWebReadable } from "@/lib/storage/local";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;

  const asset = await prisma.asset.findFirst({
    where: { projectId: id, kind: "original" },
  });
  if (!asset) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "No video for this project." } }, { status: 404 });
  }

  const stats = await statAsset(asset.filePath);
  const fileSize = stats.size;
  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    const stream = readAssetStream(asset.filePath);
    return new NextResponse(streamToWebReadable(stream), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= fileSize) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileSize}` } });
  }

  const stream = readAssetStream(asset.filePath, { start, end });
  return new NextResponse(streamToWebReadable(stream), {
    status: 206,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
    },
  });
}
