import { describe, expect, it } from "vitest";
import { transitionLookAt } from "@/lib/timeline/transition-look";
import type { ProgramItem } from "@/lib/timeline/program";
import type { CardOperation } from "@/types/edit-operation";

const card: CardOperation = {
  id: "c1",
  type: "card",
  at: 10,
  duration: 3,
  template: "title",
  title: "Part 2",
  background: "#111418",
  createdAt: 0,
};
const footage: ProgramItem[] = [
  { kind: "source", start: 0, end: 10 },
  { kind: "source", start: 10, end: 20 },
];

describe("transitionLookAt", () => {
  it("shows nothing with plain cuts", () => {
    expect(transitionLookAt({ items: footage, joins: [{ kind: "cut" }], fadeIn: null, fadeOut: null }, 10)).toEqual({
      color: null,
      card: null,
    });
  });

  it("dips to full color at the join and back out over half the length each side", () => {
    const program = {
      items: footage,
      joins: [{ kind: "dip" as const, color: "white" as const, seconds: 1 }],
      fadeIn: null,
      fadeOut: null,
    };
    expect(transitionLookAt(program, 10).color).toEqual({ color: "white", opacity: 1 });
    expect(transitionLookAt(program, 9.75).color?.opacity).toBeCloseTo(0.5);
    expect(transitionLookAt(program, 10.25).color?.opacity).toBeCloseTo(0.5);
    expect(transitionLookAt(program, 9).color).toBeNull();
  });

  it("fades a card in before it and out after it for a crossfade", () => {
    const program = {
      items: [footage[0], { kind: "card" as const, card }, footage[1]],
      joins: [
        { kind: "crossfade" as const, seconds: 1 },
        { kind: "crossfade" as const, seconds: 1 },
      ],
      fadeIn: null,
      fadeOut: null,
    };
    expect(transitionLookAt(program, 9.5).card?.opacity).toBeCloseTo(0.5);
    expect(transitionLookAt(program, 13.25).card?.opacity).toBeCloseTo(0.75);
    expect(transitionLookAt(program, 11).card).toBeNull();
  });

  it("fades the episode in and out", () => {
    const program = {
      items: footage,
      joins: [{ kind: "cut" as const }],
      fadeIn: { color: "black" as const, seconds: 2 },
      fadeOut: { color: "black" as const, seconds: 2 },
    };
    expect(transitionLookAt(program, 0).color?.opacity).toBe(1);
    expect(transitionLookAt(program, 1).color?.opacity).toBeCloseTo(0.5);
    expect(transitionLookAt(program, 19).color?.opacity).toBeCloseTo(0.5);
  });
});
