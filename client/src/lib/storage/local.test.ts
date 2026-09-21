import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deleteProjectDir, ensureProjectDirs, getDataDir, InvalidPathError, resolveInDataDir, writeAsset } from "@/lib/storage/local";

// getDataDir() resolves DATA_DIR against process.cwd() at call time -- set
// it to an absolute temp path (mkdtemp's own return value is already
// absolute, so process.resolve leaves it unchanged regardless of cwd) so
// these tests never touch the real project's ./data.
describe("storage/local (real fs, temp DATA_DIR)", () => {
  let tempDir: string;
  const originalDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "transcriptcut-test-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("resolveInDataDir", () => {
    it("resolves a plain relative path inside DATA_DIR", () => {
      expect(resolveInDataDir("projects/abc/original/video.mp4")).toBe(
        path.join(getDataDir(), "projects/abc/original/video.mp4")
      );
    });

    it("rejects a path that escapes DATA_DIR via ../", () => {
      expect(() => resolveInDataDir("../../etc/passwd")).toThrow(InvalidPathError);
    });

    it("rejects an absolute path outside DATA_DIR", () => {
      expect(() => resolveInDataDir("/etc/passwd")).toThrow(InvalidPathError);
    });

    it("rejects a sibling directory that merely shares DATA_DIR's name as a prefix", () => {
      // e.g. DATA_DIR=/tmp/foo must not treat /tmp/foo-evil/file.txt as inside it.
      const siblingWithSamePrefix = `${getDataDir()}-evil/file.txt`;
      expect(() => resolveInDataDir(siblingWithSamePrefix)).toThrow(InvalidPathError);
    });

    it("allows resolving DATA_DIR itself", () => {
      expect(resolveInDataDir(".")).toBe(getDataDir());
    });
  });

  describe("writeAsset", () => {
    it("sanitizes a client-supplied filename, stripping path components and unsafe characters", async () => {
      const { relativePath } = await writeAsset(
        "project1",
        "logo",
        "../../evil/name with spaces & symbols!.png",
        new Uint8Array([1, 2, 3])
      );
      // basename() strips the path components, then unsafe chars become "_".
      expect(relativePath).toBe("projects/project1/logo/name_with_spaces___symbols_.png");
    });

    it("rejects a project id containing path-traversal characters", async () => {
      await expect(writeAsset("../../etc", "logo", "file.png", new Uint8Array())).rejects.toThrow(InvalidPathError);
    });
  });

  it("ensureProjectDirs creates every asset-kind subdirectory", async () => {
    await ensureProjectDirs("project1");
    const kinds = await readdir(path.join(getDataDir(), "projects", "project1"));
    expect(kinds.sort()).toEqual(["audio", "logo", "original", "proxy", "render", "thumbnail"]);
  });

  it("deleteProjectDir removes the whole project directory", async () => {
    await ensureProjectDirs("project1");
    await deleteProjectDir("project1");
    await expect(readdir(path.join(getDataDir(), "projects", "project1"))).rejects.toThrow();
  });
});
