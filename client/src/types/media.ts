/** A file in the project's media library (GET /api/projects/:id/media). */
export type MediaItem = {
  id: string;
  name: string;
  type: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Seconds, for video. */
  duration: number | null;
  url: string;
};
