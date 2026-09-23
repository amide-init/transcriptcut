import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, writeAsset } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";

export const logoRoute = new Hono();

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB local upload cap for a logo/watermark image

// Raster formats only -- the logo is fed straight into ffmpeg's filtergraph
// as an -i input (see lib/ffmpeg/plan.ts), and this build of ffmpeg has no
// SVG decoder (no librsvg), so an SVG upload previews fine in the browser
// but fails the export with "no decoder found for: svg".
const SUPPORTED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

logoRoute.get("/:id/logo", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "logo" } });
  if (!asset) {
    return errorResponse(c, "NOT_FOUND", "No logo for this project.", 404);
  }

  const file = Bun.file(resolveInDataDir(asset.filePath));
  return new Response(file, { headers: { "Content-Type": asset.mimeType } });
});

logoRoute.post("/:id/logo", async (c) => {
  const id = c.req.param("id");

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }

  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected multipart/form-data.", 400);
  }

  const file = body.file;
  if (!(file instanceof File)) {
    return errorResponse(c, "MISSING_FILE", "No file was provided.", 400);
  }
  if (file.size === 0) {
    return errorResponse(c, "EMPTY_FILE", "The uploaded file is empty.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      c,
      "FILE_TOO_LARGE",
      `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB upload limit.`,
      413
    );
  }
  if (!SUPPORTED_LOGO_MIME_TYPES.has(file.type)) {
    return errorResponse(
      c,
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

  return c.json({ success: true, asset, logoUrl: `/api/projects/${id}/logo` });
});

logoRoute.delete("/:id/logo", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "logo" } });
  if (!asset) {
    return errorResponse(c, "NOT_FOUND", "No logo for this project.", 404);
  }

  await prisma.asset.delete({ where: { id: asset.id } });

  return c.json({ success: true });
});
