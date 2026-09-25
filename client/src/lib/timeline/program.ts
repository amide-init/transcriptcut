import type { CardOperation, EditOperation, SplitOperation } from "@/types/edit-operation";
import type { PlayableRange } from "@/types/timeline";
import { nextPlayableTime, sourceTimeToEditedTime } from "@/lib/timeline/cuts";

/**
 * The "program" is what actually plays: the kept source ranges with title
 * cards inserted between them. Cards add time that isn't in the source, so
 * three clocks exist:
 *
 *   source time  -- the original video (transcript, cuts, splits, cards' `at`)
 *   edited time  -- source with cuts removed (lib/timeline/cuts.ts)
 *   program time -- edited time with cards inserted (what renders)
 *
 * Everything that already works in edited time (captions, chapters) shifts
 * into program time through editedToProgramTime, so cuts and cards compose
 * without either knowing about the other. Duplicated, not imported, across
 * the client/server boundary like cuts.ts -- keep both copies identical.
 */

const EPSILON = 0.001;

/** A card placed on the edited timeline. */
export type CardSlot = {
  card: CardOperation;
  /** Edited time the card plays at (before the source content there). */
  editedAt: number;
  /** Source time playback resumes at once the card has played. */
  resumeAt: number;
};

export type ProgramItem =
  | { kind: "source"; start: number; end: number }
  | { kind: "card"; card: CardOperation };

export function cardOperations(operations: EditOperation[]): CardOperation[] {
  return operations.filter((op): op is CardOperation => op.type === "card");
}

function splitTimes(operations: EditOperation[]): number[] {
  return operations
    .filter((op): op is SplitOperation => op.type === "split" && op.timestamp > 0)
    .map((op) => op.timestamp)
    .sort((a, b) => a - b);
}

/**
 * Places each card on the edited timeline, in play order.
 *
 * A card plays before the content at its `at` time; if that moment was
 * cut, before the next content that wasn't. A card belongs to the scene
 * starting at `at`, so when that whole scene is cut its card goes too --
 * otherwise cutting "Part 2" would leave its title card announcing Part 3.
 * Intro (at 0) and outro (at the end) cards always stay.
 */
export function placeCards(
  operations: EditOperation[],
  ranges: PlayableRange[],
  sourceDuration: number
): CardSlot[] {
  const splits = splitTimes(operations);
  const editedDuration = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);

  const slots: CardSlot[] = [];
  for (const card of cardOperations(operations)) {
    const isOutro = card.at >= sourceDuration - EPSILON;
    const isIntro = card.at <= EPSILON;
    if (!isIntro && !isOutro) {
      const sceneEnd = splits.find((t) => t > card.at + EPSILON) ?? sourceDuration;
      const sceneHasContent = ranges.some((r) => r.start < sceneEnd && r.end > card.at);
      if (!sceneHasContent) continue;
    }
    const resumeAt = isOutro ? null : nextPlayableTime(card.at, ranges);
    slots.push(
      resumeAt === null
        ? { card, editedAt: editedDuration, resumeAt: sourceDuration }
        : { card, editedAt: sourceTimeToEditedTime(resumeAt, ranges), resumeAt }
    );
  }
  return slots.sort((a, b) => a.editedAt - b.editedAt || a.card.createdAt - b.card.createdAt);
}

export function cardsDuration(slots: CardSlot[]): number {
  return slots.reduce((sum, s) => sum + s.card.duration, 0);
}

/**
 * Edited time -> program time: adds the duration of every card played
 * before it. A card sitting exactly at `editedTime` counts by default
 * (content there starts after its card -- right for captions); pass
 * includeCardsAtPoint: false to land at the card's own start instead
 * (right for a chapter marker, whose chapter should include its card).
 */
export function editedToProgramTime(
  editedTime: number,
  slots: CardSlot[],
  { includeCardsAtPoint = true }: { includeCardsAtPoint?: boolean } = {}
): number {
  let shift = 0;
  for (const slot of slots) {
    const before = slot.editedAt < editedTime - EPSILON;
    const atPoint = Math.abs(slot.editedAt - editedTime) <= EPSILON;
    if (before || (atPoint && includeCardsAtPoint)) shift += slot.card.duration;
  }
  return editedTime + shift;
}

/**
 * Program time -> where that is: inside a card (with how far into it), or
 * at an edited-timeline time.
 */
export function locateProgramTime(
  programTime: number,
  slots: CardSlot[]
): { editedTime: number; card: CardSlot | null; cardOffset: number } {
  let shift = 0;
  for (const slot of slots) {
    const cardStart = slot.editedAt + shift;
    if (programTime < cardStart) break;
    if (programTime < cardStart + slot.card.duration) {
      return { editedTime: slot.editedAt, card: slot, cardOffset: programTime - cardStart };
    }
    shift += slot.card.duration;
  }
  return { editedTime: Math.max(0, programTime - shift), card: null, cardOffset: 0 };
}

/**
 * The render's play order: source ranges, split wherever a card is
 * inserted, with the cards in between. With no cards this is exactly the
 * playable ranges.
 */
export function buildProgramItems(ranges: PlayableRange[], slots: CardSlot[]): ProgramItem[] {
  const items: ProgramItem[] = [];
  let next = 0;
  let edited = 0;
  for (const r of ranges) {
    let start = r.start;
    const rangeEditedEnd = edited + (r.end - r.start);
    while (next < slots.length && slots[next].editedAt < rangeEditedEnd - EPSILON) {
      const at = r.start + (slots[next].editedAt - edited);
      if (at > start + EPSILON) items.push({ kind: "source", start, end: at });
      start = Math.max(start, at);
      items.push({ kind: "card", card: slots[next].card });
      next++;
    }
    if (r.end > start + EPSILON) items.push({ kind: "source", start, end: r.end });
    edited = rangeEditedEnd;
  }
  for (; next < slots.length; next++) items.push({ kind: "card", card: slots[next].card });
  return items;
}

export function programItemDuration(item: ProgramItem): number {
  return item.kind === "card" ? item.card.duration : item.end - item.start;
}

/**
 * An edited-time span (a caption cue, a word) in program time. Its start
 * lands after any card at that moment and its end before one, so a cue
 * that ends right where a card begins never stays up over the card.
 */
export function editedRangeToProgram(start: number, end: number, slots: CardSlot[]): { start: number; end: number } {
  return {
    start: editedToProgramTime(start, slots),
    end: editedToProgramTime(end, slots, { includeCardsAtPoint: false }),
  };
}

/** Each card in the program with the program time it starts at. */
export function cardStartTimes(items: ProgramItem[]): { start: number; card: CardOperation }[] {
  const starts: { start: number; card: CardOperation }[] = [];
  let t = 0;
  for (const item of items) {
    if (item.kind === "card") starts.push({ start: t, card: item.card });
    t += programItemDuration(item);
  }
  return starts;
}
