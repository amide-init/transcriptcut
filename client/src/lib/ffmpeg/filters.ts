/**
 * Maps a filter preset id (see lib/video/filters.ts, the browser CSS-filter
 * preview) to an equivalent FFmpeg video filter for the actual render.
 *
 * These are reasonable visual approximations, not a guaranteed pixel-exact
 * match to the CSS `filter` preview -- browser CSS filters and FFmpeg's
 * filter graph are different color pipelines with no 1:1 mapping. Good
 * enough for an MVP preset system; revisit if exact parity ever matters.
 */
const FFMPEG_FILTERS: Record<string, string | null> = {
  none: null,
  bw: "hue=s=0",
  vintage: "curves=preset=vintage",
  warm: "colorbalance=rs=.2:gs=.05:bs=-.15,eq=saturation=1.3:brightness=0.05:contrast=1.05",
  cool: "colorbalance=rs=-.15:gs=0:bs=.2,eq=saturation=1.15:contrast=1.05",
  contrast: "eq=contrast=1.4:saturation=1.1",
  faded: "eq=contrast=0.85:brightness=0.1:saturation=0.7",
};

export function getFfmpegFilter(filterId: string): string | null {
  return FFMPEG_FILTERS[filterId] ?? null;
}
