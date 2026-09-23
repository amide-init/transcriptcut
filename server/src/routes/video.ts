import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";

export const videoRoute = new Hono();

// Bun.file() returned directly as a Response body natively handles the
// incoming Range header (206 + Content-Range/Accept-Ranges/Content-Length,
// or a full 200 with no Range header) -- verified empirically against Bun
// v1.4.2. No manual range-regex parsing needed, unlike the old Next route.
videoRoute.get("/:id/video", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "original" } });
  if (!asset) {
    return errorResponse(c, "NOT_FOUND", "No video for this project.", 404);
  }

  const file = Bun.file(resolveInDataDir(asset.filePath));
  return new Response(file, {
    headers: { "Content-Type": asset.mimeType, "Accept-Ranges": "bytes" },
  });
});
