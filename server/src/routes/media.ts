import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, sanitizeFilename, writeAssetStream } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";
import { getMaxUploadBytes } from "@/lib/limits";
import { logger } from "@/lib/logger";
import { probeDuration, probeVideoStream } from "@/lib/ffmpeg/probe";
import type { EditOperation } from "@/types/edit-operation";

export const mediaRoute = new Hono();

/** Still images are small; B-roll video can be as large as any upload. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Raster formats ffmpeg decodes as a looped input (no SVG decoder -- see routes/logo.ts). */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type Asset = Awaited<ReturnType<typeof prisma.asset.findFirstOrThrow>>;

function toMediaItem(projectId: string, asset: Asset) {
  return {
    id: asset.id,
    name: asset.name ?? "media",
    type: asset.mimeType.startsWith("image/") ? ("image" as const) : ("video" as const),
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    url: `/api/projects/${projectId}/media/${asset.id}/file`,
  };
}

/** The project's media library: images and video clips to use as B-roll. */
mediaRoute.get("/:id/media", async (c) => {
  const id = c.req.param("id");
  const assets = await prisma.asset.findMany({ where: { projectId: id, kind: "media" }, orderBy: { createdAt: "asc" } });
  return c.json({ success: true, media: assets.map((a) => toMediaItem(id, a)) });
});

/**
 * POST /api/projects/:id/media?filename=clip.mp4 -- raw body, like the main
 * upload, so video streams straight to disk. Each file is stored under a
 * unique prefix (a library holds many files, often with the same camera
 * names), probed for its size and length, and refused if ffmpeg can't read
 * it -- better now than at export time.
 */
mediaRoute.post("/:id/media", async (c) => {
  const id = c.req.param("id");
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return errorResponse(c, "NOT_FOUND", "Project not found.", 404);

  const filename = c.req.query("filename");
  if (!filename) return errorResponse(c, "MISSING_FILENAME", "A ?filename= query param is required.", 400);

  const contentType = c.req.header("content-type") ?? "";
  const isImage = IMAGE_TYPES.has(contentType);
  if (!isImage && !contentType.startsWith("video/")) {
    return errorResponse(c, "INVALID_FILE_TYPE", "Use a PNG, JPG or WEBP image, or a video file.", 400);
  }

  const contentLength = Number(c.req.header("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse(c, "MISSING_CONTENT_LENGTH", "A Content-Length header is required.", 400);
  }
  const maxBytes = isImage ? MAX_IMAGE_BYTES : getMaxUploadBytes();
  if (contentLength > maxBytes) {
    return errorResponse(c, "FILE_TOO_LARGE", `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`, 413);
  }
  const body = c.req.raw.body;
  if (!body) return errorResponse(c, "EMPTY_FILE", "The uploaded file is empty.", 400);

  const storedName = `${randomUUID().slice(0, 8)}-${sanitizeFilename(filename)}`;
  const { relativePath, absolutePath, sizeBytes } = await writeAssetStream(id, "media", storedName, body);

  let dimensions: { width: number; height: number };
  let duration: number | null = null;
  try {
    dimensions = await probeVideoStream(absolutePath);
    if (!isImage) duration = await probeDuration(absolutePath);
  } catch (err) {
    logger.warn(`Media upload for ${id} couldn't be read:`, err);
    await rm(absolutePath, { force: true });
    return errorResponse(c, "UNREADABLE_MEDIA", "That file couldn't be read as an image or video.", 400);
  }

  const asset = await prisma.asset.create({
    data: {
      projectId: id,
      kind: "media",
      filePath: relativePath,
      mimeType: contentType,
      sizeBytes,
      name: filename.slice(0, 200),
      width: dimensions.width,
      height: dimensions.height,
      duration,
    },
  });
  return c.json({ success: true, media: toMediaItem(id, asset) }, 201);
});

/** Serves a media file; Bun handles Range requests, so video seeks in the preview. */
mediaRoute.get("/:id/media/:assetId/file", async (c) => {
  const asset = await prisma.asset.findFirst({
    where: { id: c.req.param("assetId"), projectId: c.req.param("id"), kind: "media" },
  });
  if (!asset) return errorResponse(c, "NOT_FOUND", "Media not found.", 404);
  return new Response(Bun.file(resolveInDataDir(asset.filePath)), {
    headers: { "Content-Type": asset.mimeType, "Accept-Ranges": "bytes" },
  });
});

/**
 * Deletes a media file -- unless B-roll on the timeline still uses it, so
 * an export can never reference a missing file. The response lists how many
 * uses to remove first.
 */
mediaRoute.delete("/:id/media/:assetId", async (c) => {
  const projectId = c.req.param("id");
  const assetId = c.req.param("assetId");
  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId, kind: "media" } });
  if (!asset) return errorResponse(c, "NOT_FOUND", "Media not found.", 404);

  const ops = await prisma.editOperation.findMany({ where: { projectId, type: "overlay" } });
  const uses = ops.filter((op) => (JSON.parse(op.dataJson) as EditOperation & { assetId?: string }).assetId === assetId);
  if (uses.length > 0) {
    return errorResponse(
      c,
      "MEDIA_IN_USE",
      `This file is used as B-roll ${uses.length === 1 ? "once" : `${uses.length} times`} -- remove that first.`,
      409
    );
  }

  await prisma.asset.delete({ where: { id: asset.id } });
  await rm(resolveInDataDir(asset.filePath), { force: true });
  return c.json({ success: true });
});
