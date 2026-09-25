import { useMemo } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { computePlayableRanges, getEditedDuration, sourceTimeToEditedTime } from "@/lib/timeline/cuts";
import {
  buildProgram,
  cardsDuration,
  editedToProgramTime,
  type CardSlot,
  type Fade,
  type Join,
  type PlacedOverlay,
  type ProgramItem,
} from "@/lib/timeline/program";
import type { CutOperation } from "@/types/edit-operation";
import type { PlayableRange } from "@/types/timeline";

export type Program = {
  cuts: CutOperation[];
  ranges: PlayableRange[];
  slots: CardSlot[];
  items: ProgramItem[];
  /** How items[i] joins items[i + 1]. */
  joins: Join[];
  fadeIn: Fade | null;
  fadeOut: Fade | null;
  /** B-roll on the program timeline. */
  overlays: PlacedOverlay[];
  editedDuration: number;
  /** Edited duration plus every card: what the export runs for. */
  duration: number;
};

/** The project's program (lib/timeline/program.ts), derived from the timeline store. */
export function useProgram(): Program {
  const sourceDuration = usePlayerStore((s) => s.duration);
  const operations = useTimelineStore((s) => s.operations);

  return useMemo(() => {
    const cuts = operations.filter((op): op is CutOperation => op.type === "cut");
    const ranges = computePlayableRanges(sourceDuration, cuts);
    const program =
      sourceDuration > 0
        ? buildProgram(operations, ranges, sourceDuration)
        : { slots: [], items: [], joins: [], fadeIn: null, fadeOut: null, overlays: [] };
    const editedDuration = getEditedDuration(ranges);
    return {
      cuts,
      ranges,
      ...program,
      editedDuration,
      duration: editedDuration + cardsDuration(program.slots),
    };
  }, [operations, sourceDuration]);
}

/**
 * Where the playhead is on the program timeline: inside the card on screen,
 * or at the source time the <video> is on.
 */
export function programPlayhead(
  program: Program,
  sourceTime: number,
  card: { id: string; elapsed: number } | null
): number {
  if (card) {
    let t = 0;
    for (const item of program.items) {
      if (item.kind === "card" && item.card.id === card.id) return t + card.elapsed;
      t += item.kind === "card" ? item.card.duration : item.end - item.start;
    }
  }
  const edited = program.editedDuration > 0 ? sourceTimeToEditedTime(sourceTime, program.ranges) : 0;
  // Paused exactly where a card plays (e.g. at 0 with an intro): the card
  // is still ahead, so the playhead sits at its start rather than past it.
  return editedToProgramTime(edited, program.slots, { includeCardsAtPoint: false });
}
