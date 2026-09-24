import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir } from "@/lib/storage/local";
import { errorResponse } from "@/lib/http";

export const videoRoute = new Hono();

// Bun.file() returned directly as a Response body natively handles the
// incoming Range header (206 + Content-Range/Accept-Ranges/Content-Length,
// or a full 200 with no Range header) -- verified empirically against Bun
// v1.4.2. No manual range-regex parsing needed, unlike the old Next route.
// ?variant=proxy serves the 720p editing proxy (claude.md section 16) --
// a distinct URL rather than silently swapping what /video returns, so a
// proxy finishing mid-session can't change the bytes under an in-flight
// Range request. Render always reads the original asset directly.
videoRoute.get("/:id/video", async (c) => {
  const id = c.req.param("id");
  const kind = c.req.query("variant") === "proxy" ? "proxy" : "original";

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind } });
  if (!asset) {
    return errorResponse(c, "NOT_FOUND", "No video for this project.", 404);
  }

  const file = Bun.file(resolveInDataDir(asset.filePath));
  return new Response(file, {
    headers: { "Content-Type": asset.mimeType, "Accept-Ranges": "bytes" },
  });
});

// The small speech-quality track extracted for transcription -- the
// timeline decodes this for its waveform instead of the whole video.
videoRoute.get("/:id/audio", async (c) => {
  const id = c.req.param("id");

  const asset = await prisma.asset.findFirst({ where: { projectId: id, kind: "audio" } });
  if (!asset) {
    return errorResponse(c, "NOT_FOUND", "No extracted audio for this project.", 404);
  }

  const file = Bun.file(resolveInDataDir(asset.filePath));
  return new Response(file, {
    headers: { "Content-Type": asset.mimeType, "Accept-Ranges": "bytes" },
  });
});
