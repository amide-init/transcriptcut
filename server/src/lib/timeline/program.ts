import type { CardOperation, EditOperation, SplitOperation, TransitionOperation } from "@/types/edit-operation";
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
 * inserted (and at any extra edited times in `splitAt`, so a transition in
 * the middle of a kept range gets a join to live on), with the cards in
 * between. With no cards or splits this is exactly the playable ranges.
 */
export function buildProgramItems(ranges: PlayableRange[], slots: CardSlot[], splitAt: number[] = []): ProgramItem[] {
  // Stable sort keeps cards in slot order; a split at a card's moment adds nothing.
  const events: { editedAt: number; card?: CardOperation }[] = [
    ...slots.map((s) => ({ editedAt: s.editedAt, card: s.card })),
    ...splitAt.map((editedAt) => ({ editedAt })),
  ].sort((a, b) => a.editedAt - b.editedAt);

  const items: ProgramItem[] = [];
  let next = 0;
  let edited = 0;
  for (const r of ranges) {
    let start = r.start;
    const rangeEditedEnd = edited + (r.end - r.start);
    while (next < events.length && events[next].editedAt < rangeEditedEnd - EPSILON) {
      const at = r.start + (events[next].editedAt - edited);
      if (at > start + EPSILON) items.push({ kind: "source", start, end: at });
      start = Math.max(start, at);
      const card = events[next].card;
      if (card) items.push({ kind: "card", card });
      next++;
    }
    if (r.end > start + EPSILON) items.push({ kind: "source", start, end: r.end });
    edited = rangeEditedEnd;
  }
  for (; next < events.length; next++) {
    const card = events[next].card;
    if (card) items.push({ kind: "card", card });
  }
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

/** A fade from/to a solid color, `seconds` long. */
export type Fade = { color: "black" | "white"; seconds: number };

/**
 * How two consecutive program items are joined. "cut" is the usual 30ms
 * declick crossfade; a dip fades the first item out to a color and the
 * next in from it (half the seconds each); a crossfade blends into or out
 * of a title card. None of them change the program's length.
 */
export type Join =
  | { kind: "cut" }
  | { kind: "dip"; color: "black" | "white"; seconds: number }
  | { kind: "crossfade"; seconds: number };

/** A transition placed on the edited timeline, at the start of its scene's content. */
export type TransitionMarker = { transition: TransitionOperation; editedAt: number };

const fadeColor = (t: TransitionOperation): "black" | "white" => (t.kind === "dipWhite" ? "white" : "black");

/**
 * Places transitions like cards (placeCards): one per moment (the latest
 * wins), dropped with their scene if it's cut entirely. A transition at 0
 * fades the episode in and one at the end fades it out.
 */
export function placeTransitions(
  operations: EditOperation[],
  ranges: PlayableRange[],
  sourceDuration: number
): { markers: TransitionMarker[]; fadeIn: Fade | null; fadeOut: Fade | null } {
  const latest = new Map<number, TransitionOperation>();
  for (const op of operations) {
    if (op.type !== "transition") continue;
    const key = Math.round(op.at * 1000);
    const current = latest.get(key);
    if (!current || op.createdAt >= current.createdAt) latest.set(key, op);
  }

  const splits = splitTimes(operations);
  const markers: TransitionMarker[] = [];
  let fadeIn: Fade | null = null;
  let fadeOut: Fade | null = null;
  for (const transition of latest.values()) {
    const fade = { color: fadeColor(transition), seconds: transition.duration };
    if (transition.at <= EPSILON) {
      fadeIn = fade;
      continue;
    }
    if (transition.at >= sourceDuration - EPSILON) {
      fadeOut = fade;
      continue;
    }
    const sceneEnd = splits.find((t) => t > transition.at + EPSILON) ?? sourceDuration;
    if (!ranges.some((r) => r.start < sceneEnd && r.end > transition.at)) continue;
    const resumeAt = nextPlayableTime(transition.at, ranges);
    if (resumeAt === null) continue;
    markers.push({ transition, editedAt: sourceTimeToEditedTime(resumeAt, ranges) });
  }
  return { markers: markers.sort((a, b) => a.editedAt - b.editedAt), fadeIn, fadeOut };
}

/**
 * The join style between each pair of consecutive items (entry i joins
 * items[i] and items[i+1]). Every join at a transition's moment gets it --
 * with a card there, that's both the join into the card and out of it. A
 * crossfade needs a card on one side; between two stretches of footage it
 * falls back to a plain cut.
 */
export function resolveJoins(items: ProgramItem[], markers: TransitionMarker[]): Join[] {
  const joins: Join[] = [];
  let edited = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const item = items[i];
    if (item.kind === "source") edited += item.end - item.start;
    const marker = markers.find((m) => Math.abs(m.editedAt - edited) <= EPSILON);
    if (!marker) {
      joins.push({ kind: "cut" });
      continue;
    }
    const { kind, duration } = marker.transition;
    if (kind === "crossfade") {
      const touchesCard = item.kind === "card" || items[i + 1].kind === "card";
      joins.push(touchesCard ? { kind: "crossfade", seconds: duration } : { kind: "cut" });
    } else {
      joins.push({ kind: "dip", color: fadeColor(marker.transition), seconds: duration });
    }
  }
  return joins;
}

/** Everything that plays, and how it's stitched together. */
export type Program = {
  slots: CardSlot[];
  items: ProgramItem[];
  joins: Join[];
  fadeIn: Fade | null;
  fadeOut: Fade | null;
};

export function buildProgram(operations: EditOperation[], ranges: PlayableRange[], sourceDuration: number): Program {
  const slots = placeCards(operations, ranges, sourceDuration);
  const { markers, fadeIn, fadeOut } = placeTransitions(operations, ranges, sourceDuration);
  const items = buildProgramItems(
    ranges,
    slots,
    markers.map((m) => m.editedAt)
  );
  return { slots, items, joins: resolveJoins(items, markers), fadeIn, fadeOut };
}

/** True when the program is just the playable ranges, cut together as always. */
export function isPlainProgram(program: Program): boolean {
  return (
    program.slots.length === 0 &&
    !program.fadeIn &&
    !program.fadeOut &&
    program.joins.every((j) => j.kind === "cut")
  );
}

/** Program time at which each item starts (entry i+1 is also where join i happens). */
export function itemStartTimes(items: ProgramItem[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const item of items) {
    starts.push(t);
    t += programItemDuration(item);
  }
  return starts;
}
