import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

/**
 * Local filesystem storage for project media, per claude.md section 15.
 * Everything lives under DATA_DIR (default ./data), resolved relative to
 * the process working directory (client/ when running `next dev`/`next start`).
 *
 * Every path that touches the filesystem is validated to stay inside
 * DATA_DIR — never trust a client-supplied path directly (spec section 18).
 */

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

export function getDataDir(): string {
  // Deliberately dynamic (runtime-configurable data directory) — never meant
  // to be statically traced/bundled by the build.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "./data");
}

/** Resolve a relative path against DATA_DIR, rejecting anything that escapes it. */
export function resolveInDataDir(relativePath: string): string {
  const dataDir = getDataDir();
  const resolved = path.resolve(/*turbopackIgnore: true*/ dataDir, relativePath);
  if (resolved !== dataDir && !resolved.startsWith(dataDir + path.sep)) {
    throw new InvalidPathError(`Path escapes DATA_DIR: ${relativePath}`);
  }
  return resolved;
}

/** Project ids are generated server-side (cuid), but validate defensively anyway. */
function assertSafeProjectId(projectId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new InvalidPathError(`Invalid project id: ${projectId}`);
  }
}

export type AssetKind = "original" | "proxy" | "audio" | "thumbnail" | "render";

function projectRelativeDir(projectId: string, kind: AssetKind): string {
  assertSafeProjectId(projectId);
  return path.posix.join("projects", projectId, kind);
}

/** Strip any path components / unsafe characters from a client-supplied filename. */
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base : "file";
}

export async function ensureProjectDirs(projectId: string): Promise<void> {
  const kinds: AssetKind[] = ["original", "proxy", "audio", "thumbnail", "render"];
  await Promise.all(
    kinds.map((kind) => mkdir(resolveInDataDir(projectRelativeDir(projectId, kind)), { recursive: true }))
  );
}

export async function writeAsset(
  projectId: string,
  kind: AssetKind,
  filename: string,
  bytes: Uint8Array
): Promise<{ relativePath: string; absolutePath: string }> {
  const dir = projectRelativeDir(projectId, kind);
  const absDir = resolveInDataDir(dir);
  await mkdir(absDir, { recursive: true });

  const safeName = sanitizeFilename(filename);
  const relativePath = path.posix.join(dir, safeName);
  const absolutePath = resolveInDataDir(relativePath);

  await writeFile(absolutePath, bytes);
  return { relativePath, absolutePath };
}

export async function statAsset(relativePath: string) {
  return stat(resolveInDataDir(relativePath));
}

/** Open a read stream for an asset, optionally for a byte range (HTTP Range support). */
export function readAssetStream(relativePath: string, range?: { start: number; end: number }) {
  const absolutePath = resolveInDataDir(relativePath);
  return range
    ? createReadStream(absolutePath, { start: range.start, end: range.end })
    : createReadStream(absolutePath);
}

export async function deleteProjectDir(projectId: string): Promise<void> {
  assertSafeProjectId(projectId);
  const dir = resolveInDataDir(path.posix.join("projects", projectId));
  await rm(dir, { recursive: true, force: true });
}
