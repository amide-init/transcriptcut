import { itemStartTimes, programItemDuration, type Fade, type Join, type ProgramItem } from "@/lib/timeline/program";
import type { CardOperation } from "@/types/edit-operation";

/**
 * What the preview should lay over the player at a program time to show
 * transitions: a solid color at some opacity (a dip, or the episode fading
 * in/out), and/or a title card at some opacity (a crossfade into or out of
 * it). Mirrors the render's timing (lib/ffmpeg/plan.ts#layoutProgram),
 * including clamping each transition to half of the items it touches.
 */
export type TransitionLook = {
  color: { color: "black" | "white"; opacity: number } | null;
  card: { card: CardOperation; opacity: number } | null;
};

export function transitionLookAt(
  program: { items: ProgramItem[]; joins: Join[]; fadeIn: Fade | null; fadeOut: Fade | null },
  programTime: number
): TransitionLook {
  const { items, joins, fadeIn, fadeOut } = program;
  const look: TransitionLook = { color: null, card: null };
  if (items.length === 0) return look;

  const lengths = items.map(programItemDuration);
  const starts = itemStartTimes(items);
  const total = starts[starts.length - 1] + lengths[lengths.length - 1];
  const t = programTime;

  const showColor = (color: "black" | "white", opacity: number) => {
    const o = Math.max(0, Math.min(1, opacity));
    if (!look.color || o > look.color.opacity) look.color = { color, opacity: o };
  };

  if (fadeIn) {
    const seconds = Math.min(fadeIn.seconds, lengths[0] / 2);
    if (t < seconds) showColor(fadeIn.color, 1 - t / seconds);
  }
  if (fadeOut) {
    const seconds = Math.min(fadeOut.seconds, lengths[lengths.length - 1] / 2);
    if (t > total - seconds) showColor(fadeOut.color, (t - (total - seconds)) / seconds);
  }

  joins.forEach((join, j) => {
    if (join.kind === "cut") return;
    const at = starts[j + 1];
    const room = Math.min(lengths[j], lengths[j + 1]) / 2;
    if (join.kind === "dip") {
      const half = Math.min(join.seconds / 2, room);
      const distance = Math.abs(t - at);
      if (distance < half) showColor(join.color, 1 - distance / half);
      return;
    }
    const seconds = Math.min(join.seconds, room);
    const before = items[j];
    const after = items[j + 1];
    if (after.kind === "card" && t >= at - seconds && t < at) {
      look.card = { card: after.card, opacity: (t - (at - seconds)) / seconds };
    } else if (before.kind === "card" && t >= at && t < at + seconds) {
      look.card = { card: before.card, opacity: 1 - (t - at) / seconds };
    }
  });
  return look;
}
