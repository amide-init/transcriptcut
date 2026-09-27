import type { EditOperation, SplitOperation, SplitSource } from "@/types/edit-operation";
import type { PlayableRange } from "@/types/timeline";
import { sourceTimeToEditedTime } from "@/lib/timeline/cuts";

/** Two splits closer than this are the same boundary (double-click, AI + manual). */
const SPLIT_DEDUPE_SECONDS = 0.05;

/**
 * A stretch of the source between two scene boundaries (split operations).
 * Scenes are derived, never stored: the split ops are the source of truth,
 * so undo/redo and persistence need nothing new.
 */
export type Scene = {
  /** The split op that starts this scene, or "scene-start" for the first one. */
  id: string;
  /** null for the first scene, which starts at 0 without a split. */
  splitId: string | null;
  index: number;
  title: string;
  source: SplitSource | null;
  /** Source time. */
  start: number;
  end: number;
  /** Position on the edited (cuts-removed) timeline. */
  editedStart: number;
  editedEnd: number;
};

export function defaultSceneTitle(index: number): string {
  return `Scene ${index + 1}`;
}

/** Split ops inside (0, duration), sorted, with near-duplicates dropped (the earliest-created wins). */
export function sortedSplits(operations: EditOperation[], duration: number): SplitOperation[] {
  const splits = operations
    .filter((op): op is SplitOperation => op.type === "split")
    .filter((op) => op.timestamp > 0 && op.timestamp < duration)
    .sort((a, b) => a.timestamp - b.timestamp || a.createdAt - b.createdAt);

  const result: SplitOperation[] = [];
  for (const split of splits) {
    const last = result[result.length - 1];
    if (last && split.timestamp - last.timestamp < SPLIT_DEDUPE_SECONDS) continue;
    result.push(split);
  }
  return result;
}

/**
 * Divides [0, duration] into scenes at every split. A scene whose source
 * range was cut entirely is still returned (editedStart === editedEnd), so
 * the scene list can offer to restore it.
 */
export function buildScenes(
  duration: number,
  operations: EditOperation[],
  playableRanges: PlayableRange[]
): Scene[] {
  if (duration <= 0) return [];
  const splits = sortedSplits(operations, duration);
  const bounds = [0, ...splits.map((s) => s.timestamp), duration];
  const opening = openingSplit(operations);

  return bounds.slice(0, -1).map((start, i) => {
    const end = bounds[i + 1];
    const split = i === 0 ? opening : splits[i - 1];
    return {
      id: split?.id ?? "scene-start",
      splitId: split?.id ?? null,
      index: i,
      title: split?.title?.trim() || defaultSceneTitle(i),
      source: split?.source ?? null,
      start,
      end,
      editedStart: sourceTimeToEditedTime(start, playableRanges),
      editedEnd: sourceTimeToEditedTime(end, playableRanges),
    };
  });
}

/**
 * A split at exactly 0 isn't a boundary -- the first scene always starts
 * there -- it only carries the first scene's title, so that scene can be
 * renamed like any other. The latest one wins.
 */
function openingSplit(operations: EditOperation[]): SplitOperation | null {
  const openings = operations.filter((op): op is SplitOperation => op.type === "split" && op.timestamp === 0);
  return openings.sort((a, b) => a.createdAt - b.createdAt).at(-1) ?? null;
}

/** The scene containing this source time (the last scene for t >= duration). */
export function sceneAt(scenes: Scene[], sourceTime: number): Scene | null {
  for (const scene of scenes) {
    if (sourceTime < scene.end) return scene;
  }
  return scenes[scenes.length - 1] ?? null;
}

/**
 * Moves a time off any word it falls inside, to the middle of the nearest
 * gap between words, so a scene boundary never splits a word -- which
 * would later put a transition or card in the middle of speech. Times
 * already in a gap (or with no words at all) come back unchanged.
 */
export function snapToWordGap(time: number, words: { start: number; end: number }[]): number {
  if (words.length === 0) return time;
  const sorted = [...words].sort((a, b) => a.start - b.start);

  const inside = sorted.findIndex((w) => time > w.start && time < w.end);
  if (inside === -1) return time;

  const word = sorted[inside];
  const previousEnd = inside > 0 ? sorted[inside - 1].end : 0;
  const nextStart = inside < sorted.length - 1 ? sorted[inside + 1].start : word.end;
  const before = (previousEnd + word.start) / 2;
  const after = (word.end + nextStart) / 2;
  return time - word.start <= word.end - time ? before : after;
}

/**
 * Scene block colors, cycled by index. Full class names so Tailwind's
 * scanner keeps them (same approach as lib/transcript/speakers.ts).
 */
const SCENE_COLORS = [
  { block: "border-sky-500 bg-sky-500/20", dot: "bg-sky-500" },
  { block: "border-amber-500 bg-amber-500/20", dot: "bg-amber-500" },
  { block: "border-emerald-500 bg-emerald-500/20", dot: "bg-emerald-500" },
  { block: "border-violet-500 bg-violet-500/20", dot: "bg-violet-500" },
];

export function sceneColor(index: number): { block: string; dot: string } {
  return SCENE_COLORS[index % SCENE_COLORS.length];
}

/** Midpoint of the gap just before a word (where "split before this sentence" lands). */
export function gapBefore(wordStart: number, words: { start: number; end: number }[]): number {
  let previousEnd = 0;
  for (const w of words) {
    if (w.end <= wordStart && w.end > previousEnd) previousEnd = w.end;
  }
  return (previousEnd + wordStart) / 2;
}
