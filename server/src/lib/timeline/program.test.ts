import { describe, expect, it } from "vitest";
import {
  buildProgram,
  buildProgramItems,
  isPlainProgram,
  placeOverlays,
  cardStartTimes,
  cardsDuration,
  editedRangeToProgram,
  editedToProgramTime,
  locateProgramTime,
  placeCards,
} from "@/lib/timeline/program";
import { computePlayableRanges } from "@/lib/timeline/cuts";
import type { CardOperation, CutOperation, EditOperation } from "@/types/edit-operation";

const card = (id: string, at: number, duration = 3, createdAt = 0): CardOperation => ({
  id,
  type: "card",
  at,
  duration,
  template: "title",
  title: id,
  background: "#000000",
  createdAt,
});
const cut = (start: number, end: number): CutOperation => ({ id: `cut-${start}`, type: "cut", start, end, createdAt: 0 });
const transition = (
  at: number,
  kind: "dipBlack" | "dipWhite" | "crossfade",
  duration = 1,
  createdAt = 0
): EditOperation => ({ id: `t-${at}-${createdAt}`, type: "transition", at, kind, duration, createdAt });
const split = (timestamp: number): EditOperation => ({ id: `split-${timestamp}`, type: "split", timestamp, createdAt: 0 });

function program(ops: EditOperation[], duration = 100) {
  const ranges = computePlayableRanges(
    duration,
    ops.filter((op): op is CutOperation => op.type === "cut")
  );
  const slots = placeCards(ops, ranges, duration);
  return { ranges, slots, items: buildProgramItems(ranges, slots) };
}

describe("program without cards", () => {
  it("is exactly the playable ranges, with no time shift", () => {
    const { ranges, slots, items } = program([cut(10, 20), split(50)]);
    expect(slots).toEqual([]);
    expect(items).toEqual(ranges.map((r) => ({ kind: "source", ...r })));
    expect(editedToProgramTime(42, slots)).toBe(42);
  });
});

describe("placeCards", () => {
  it("places an intro, a mid-episode card and an outro in play order", () => {
    const { slots } = program([card("outro", 100), card("mid", 40), card("intro", 0)]);
    expect(slots.map((s) => [s.card.id, s.editedAt, s.resumeAt])).toEqual([
      ["intro", 0, 0],
      ["mid", 40, 40],
      ["outro", 100, 100],
    ]);
  });

  it("moves a card whose moment was cut to the next kept content", () => {
    const { slots } = program([cut(35, 45), card("mid", 40)]);
    expect(slots[0]).toMatchObject({ editedAt: 35, resumeAt: 45 });
  });

  it("drops a card whose whole scene was cut, but keeps intro and outro", () => {
    const { slots } = program([split(40), split(60), cut(40, 60), card("gone", 40), card("intro", 0), card("outro", 100)]);
    expect(slots.map((s) => s.card.id)).toEqual(["intro", "outro"]);
  });

  it("keeps cards at the same moment in creation order", () => {
    const { slots } = program([card("second", 40, 3, 2), card("first", 40, 3, 1)]);
    expect(slots.map((s) => s.card.id)).toEqual(["first", "second"]);
  });
});

describe("buildProgramItems", () => {
  it("splits the source range where a card is inserted", () => {
    const { items } = program([card("intro", 0, 2), card("mid", 40, 3), cut(80, 100), card("outro", 100, 4)]);
    expect(items).toEqual([
      { kind: "card", card: expect.objectContaining({ id: "intro" }) },
      { kind: "source", start: 0, end: 40 },
      { kind: "card", card: expect.objectContaining({ id: "mid" }) },
      { kind: "source", start: 40, end: 80 },
      { kind: "card", card: expect.objectContaining({ id: "outro" }) },
    ]);
  });
});

describe("time mapping", () => {
  const { slots } = program([card("intro", 0, 2), card("mid", 40, 3)]);

  it("shifts edited time by every card before it", () => {
    expect(cardsDuration(slots)).toBe(5);
    expect(editedToProgramTime(10, slots)).toBe(12);
    expect(editedToProgramTime(50, slots)).toBe(55);
  });

  it("puts content at a card's moment after the card, and chapter markers at its start", () => {
    expect(editedToProgramTime(40, slots)).toBe(45);
    expect(editedToProgramTime(40, slots, { includeCardsAtPoint: false })).toBe(42);
    expect(editedToProgramTime(0, slots, { includeCardsAtPoint: false })).toBe(0);
  });

  it("locates program time inside a card or back on the edited timeline", () => {
    expect(locateProgramTime(1, slots)).toMatchObject({ card: { card: { id: "intro" } }, cardOffset: 1 });
    expect(locateProgramTime(12, slots)).toMatchObject({ card: null, editedTime: 10 });
    expect(locateProgramTime(43.5, slots)).toMatchObject({ card: { card: { id: "mid" } }, cardOffset: 1.5 });
    expect(locateProgramTime(55, slots)).toMatchObject({ card: null, editedTime: 50 });
  });

  it("round-trips edited -> program -> edited outside cards", () => {
    for (const t of [0.5, 20, 39.9, 40.1, 99]) {
      expect(locateProgramTime(editedToProgramTime(t, slots), slots).editedTime).toBeCloseTo(t);
    }
  });
});

describe("editedRangeToProgram and cardStartTimes", () => {
  const { slots, items } = program([card("intro", 0, 2), card("mid", 40, 3)]);

  it("keeps a span that ends where a card starts from running over the card", () => {
    expect(editedRangeToProgram(38, 40, slots)).toEqual({ start: 40, end: 42 });
    expect(editedRangeToProgram(40, 41, slots)).toEqual({ start: 45, end: 46 });
  });

  it("lists each card's start on the program timeline", () => {
    expect(cardStartTimes(items).map((c) => [c.card.id, c.start])).toEqual([
      ["intro", 0],
      ["mid", 42],
    ]);
  });
});

describe("transitions", () => {
  const build = (ops: EditOperation[], duration = 100) => {
    const ranges = computePlayableRanges(
      duration,
      ops.filter((op): op is CutOperation => op.type === "cut")
    );
    return buildProgram(ops, ranges, duration);
  };

  it("leaves a project without cards or transitions plain", () => {
    expect(isPlainProgram(build([cut(10, 20), split(50)]))).toBe(true);
  });

  it("splits footage at a mid-range transition so it has a join to live on", () => {
    const p = build([split(40), transition(40, "dipBlack")]);
    expect(p.items).toEqual([
      { kind: "source", start: 0, end: 40 },
      { kind: "source", start: 40, end: 100 },
    ]);
    expect(p.joins).toEqual([{ kind: "dip", color: "black", seconds: 1 }]);
  });

  it("styles both joins around a card at the transition's moment", () => {
    const p = build([split(40), card("mid", 40), transition(40, "crossfade", 0.8)]);
    expect(p.items.map((i) => i.kind)).toEqual(["source", "card", "source"]);
    expect(p.joins).toEqual([
      { kind: "crossfade", seconds: 0.8 },
      { kind: "crossfade", seconds: 0.8 },
    ]);
  });

  it("falls back to a cut for a crossfade between two stretches of footage", () => {
    expect(build([split(40), transition(40, "crossfade")]).joins).toEqual([{ kind: "cut" }]);
  });

  it("turns transitions at the ends into fades in and out", () => {
    const p = build([transition(0, "dipBlack", 1.5), transition(100, "dipWhite", 2)]);
    expect(p.fadeIn).toEqual({ color: "black", seconds: 1.5 });
    expect(p.fadeOut).toEqual({ color: "white", seconds: 2 });
    expect(isPlainProgram(p)).toBe(false);
  });

  it("keeps only the latest transition at a moment, and drops one whose scene is cut", () => {
    const latest = build([split(40), transition(40, "dipBlack", 1, 1), transition(40, "dipWhite", 1, 2)]);
    expect(latest.joins).toEqual([{ kind: "dip", color: "white", seconds: 1 }]);
    const gone = build([split(40), split(60), cut(40, 60), transition(40, "dipBlack")]);
    expect(gone.joins.every((j) => j.kind === "cut")).toBe(true);
  });

  it("applies at the next kept content when the transition's moment was cut", () => {
    const p = build([split(40), cut(35, 45), transition(40, "dipBlack")]);
    expect(p.items).toEqual([
      { kind: "source", start: 0, end: 35 },
      { kind: "source", start: 45, end: 100 },
    ]);
    expect(p.joins[0]).toMatchObject({ kind: "dip" });
  });
});

describe("placeOverlays", () => {
  const overlay = (id: string, start: number, end: number): EditOperation => ({
    id,
    type: "overlay",
    assetId: "a1",
    start,
    end,
    mode: "full",
    createdAt: 0,
  });
  const place = (ops: EditOperation[]) => {
    const ranges = computePlayableRanges(
      100,
      ops.filter((op): op is CutOperation => op.type === "cut")
    );
    return placeOverlays(ops, ranges, placeCards(ops, ranges, 100)).map((p) => [p.overlay.id, p.start, p.end]);
  };

  it("maps B-roll through cuts and past earlier cards", () => {
    expect(place([cut(0, 10), card("intro", 0, 2), overlay("b", 20, 25)])).toEqual([["b", 12, 17]]);
  });

  it("shortens B-roll whose range was partly cut, and drops it when cut entirely", () => {
    expect(place([cut(22, 24), overlay("part", 20, 25), overlay("gone", 50, 55), cut(49, 56)])).toEqual([
      ["part", 20, 23],
    ]);
  });

  it("doesn't run over a card at its start or end", () => {
    expect(place([card("mid", 40, 3), overlay("b", 40, 45)])).toEqual([["b", 43, 48]]);
    expect(place([card("mid", 40, 3), overlay("b", 35, 40)])).toEqual([["b", 35, 40]]);
  });
});
