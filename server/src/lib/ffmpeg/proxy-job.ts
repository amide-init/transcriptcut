import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";
import { resolveInDataDir, statAsset } from "@/lib/storage/local";
import { runFfmpeg } from "@/lib/ffmpeg/run";
import { probeVideoDimensions } from "@/lib/ffmpeg/probe";
import { buildProxyArgs, needsProxy } from "@/lib/ffmpeg/audio";

/**
 * Builds a 720p editing proxy for a freshly uploaded original (claude.md
 * section 16), in the background. Best-effort: on any failure the editor
 * just keeps playing the original, so errors are logged, never surfaced.
 *
 * Renders into a temp file and renames it into place only once complete,
 * so the video route never serves a half-written proxy, and skips
 * registering the asset if the original was replaced mid-encode.
 */
export async function generateProxy(projectId: string, originalAssetId: string): Promise<void> {
  const proxyDir = path.posix.join("projects", projectId, "proxy");
  const proxyRelativePath = path.posix.join(proxyDir, "proxy.mp4");
  const tempPath = resolveInDataDir(path.posix.join(proxyDir, `proxy-${originalAssetId}.tmp.mp4`));

  try {
    const original = await prisma.asset.findUnique({ where: { id: originalAssetId } });
    if (!original) return;
    const inputPath = resolveInDataDir(original.filePath);

    const { height } = await probeVideoDimensions(inputPath);
    if (!needsProxy({ height, sizeBytes: original.sizeBytes })) return;

    await mkdir(resolveInDataDir(proxyDir), { recursive: true });
    const started = Date.now();
    await runFfmpeg(buildProxyArgs(inputPath, tempPath));

    const stillCurrent = await prisma.asset.findUnique({ where: { id: originalAssetId }, select: { id: true } });
    if (!stillCurrent) return;

    await rename(tempPath, resolveInDataDir(proxyRelativePath));
    const stats = await statAsset(proxyRelativePath);
    await prisma.asset.deleteMany({ where: { projectId, kind: "proxy" } });
    await prisma.asset.create({
      data: { projectId, kind: "proxy", filePath: proxyRelativePath, mimeType: "video/mp4", sizeBytes: stats.size },
    });
    logger.info(`Proxy ready for project ${projectId} in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    logger.warn(`Proxy generation failed for project ${projectId}; the editor will play the original.`, err);
  } finally {
    await rm(tempPath, { force: true });
  }
}
