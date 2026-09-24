import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { writeAssetStream } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";
import { getMaxUploadBytes } from "@/lib/limits";

export const uploadRoute = new Hono();

/**
 * POST /api/projects/:id/upload?filename=video.mp4
 *
 * Deliberate wire-contract change from the old Next route: the request
 * body is the raw video bytes (Content-Type: video/*), not
 * multipart/form-data. This lets the server stream straight to disk via
 * Bun.write(path, request.body) without ever buffering the whole file in
 * memory -- the old route's request.formData()/file.arrayBuffer() approach
 * held the entire upload in RAM, a real problem for large videos.
 */
uploadRoute.post("/:id/upload", async (c) => {
  const id = c.req.param("id");

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }

  const filename = c.req.query("filename");
  if (!filename) {
    return errorResponse(c, "MISSING_FILENAME", "A ?filename= query param is required.", 400);
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.startsWith("video/")) {
    return errorResponse(c, "INVALID_FILE_TYPE", "Only video files are supported.", 400);
  }

  const contentLengthHeader = c.req.header("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse(c, "MISSING_CONTENT_LENGTH", "A Content-Length header is required.", 400);
  }
  const maxBytes = getMaxUploadBytes();
  if (contentLength > maxBytes) {
    return errorResponse(
      c,
      "FILE_TOO_LARGE",
      `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB upload limit.`,
      413
    );
  }

  const body = c.req.raw.body;
  if (!body) {
    return errorResponse(c, "EMPTY_FILE", "The uploaded file is empty.", 400);
  }

  const { relativePath, sizeBytes } = await writeAssetStream(id, "original", filename, body);

  // Only one "original" asset per project for v1 -- replace any previous one,
  // along with the audio track extracted from it.
  await prisma.asset.deleteMany({ where: { projectId: id, kind: { in: ["original", "audio"] } } });
  const asset = await prisma.asset.create({
    data: {
      projectId: id,
      kind: "original",
      filePath: relativePath,
      mimeType: contentType,
      sizeBytes,
    },
  });

  return c.json({ success: true, asset, videoUrl: `/api/projects/${id}/video` });
});
