import { useCallback, useMemo } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import { buildScenes, snapToWordGap, type Scene } from "@/lib/timeline/scenes";
import type { CutOperation } from "@/types/edit-operation";

/** Minimum distance from an existing boundary (or either end) for a new split. */
const MIN_SCENE_SECONDS = 0.5;

/** The project's scenes plus the split action, derived from the timeline store. */
export function useScenes(): {
  scenes: Scene[];
  /** Splits at a source time (snapped off words); returns false if too close to an existing boundary. */
  splitAt: (sourceTime: number) => boolean;
} {
  const duration = usePlayerStore((s) => s.duration);
  const operations = useTimelineStore((s) => s.operations);
  const addSplit = useTimelineStore((s) => s.addSplit);
  const transcript = useTranscriptStore((s) => s.transcript);

  const scenes = useMemo(() => {
    const cuts = operations.filter((op): op is CutOperation => op.type === "cut");
    return buildScenes(duration, operations, computePlayableRanges(duration, cuts));
  }, [duration, operations]);

  const splitAt = useCallback(
    (sourceTime: number) => {
      const words = transcript?.segments.flatMap((s) => s.words) ?? [];
      const t = snapToWordGap(sourceTime, words);
      const boundaries = [0, duration, ...scenes.map((s) => s.start)];
      if (boundaries.some((b) => Math.abs(b - t) < MIN_SCENE_SECONDS)) return false;
      addSplit(t);
      return true;
    },
    [transcript, duration, scenes, addSplit]
  );

  return { scenes, splitAt };
}
