/**
 * Largest accepted source upload. Video podcasts routinely run to several
 * GB, and the upload route streams straight to disk, so memory isn't the
 * constraint -- disk space is. Overridable with MAX_UPLOAD_MB for
 * self-hosters with smaller (or larger) disks.
 */
const DEFAULT_MAX_UPLOAD_MB = 10 * 1024;

export function getMaxUploadBytes(): number {
  const fromEnv = Number(process.env.MAX_UPLOAD_MB);
  const mb = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}
