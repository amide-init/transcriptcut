import type { PlayableRange } from "@/types/timeline";

/**
 * The slice of the edited program to preview: up to `seconds` of playable
 * audio starting at source time `start` (or the next playable moment after
 * it, if `start` sits inside a cut), so the sample sounds exactly like that
 * stretch of the export will, cuts included. If `start` is past the last
 * playable audio, the sample is the final `seconds` of the program instead.
 */
export function previewWindow(playableRanges: PlayableRange[], start: number, seconds: number): PlayableRange[] {
  const firstIndex = playableRanges.findIndex((r) => r.end > start);
  let from = start;
  if (firstIndex === -1) {
    // Past the end: walk back from the last range to collect the tail.
    const tail: PlayableRange[] = [];
    let remaining = seconds;
    for (let i = playableRanges.length - 1; i >= 0 && remaining > 0; i--) {
      const r = playableRanges[i];
      const take = Math.min(remaining, r.end - r.start);
      tail.unshift({ start: r.end - take, end: r.end });
      remaining -= take;
    }
    return tail;
  }

  const window: PlayableRange[] = [];
  let remaining = seconds;
  for (let i = firstIndex; i < playableRanges.length && remaining > 0; i++) {
    const r = playableRanges[i];
    const sliceStart = Math.max(r.start, from);
    const take = Math.min(remaining, r.end - sliceStart);
    if (take > 0) {
      window.push({ start: sliceStart, end: sliceStart + take });
      remaining -= take;
    }
    from = r.end;
  }
  return window;
}
