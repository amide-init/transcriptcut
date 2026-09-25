import { describe, expect, it } from "vitest";
import { operationsForSuggestions, suggestionsFromChapters } from "@/lib/scenes/suggestions";
import type { EditOperation } from "@/types/edit-operation";

const words = [
  { start: 0, end: 1 },
  { start: 50, end: 51 },
  { start: 60, end: 61 },
];

describe("suggestionsFromChapters", () => {
  it("starts the first scene at 0 and later ones in the silence before their chapter", () => {
    expect(
      suggestionsFromChapters(
        [
          { title: "Setup", sourceStart: 60 },
          { title: "Intro", sourceStart: 0 },
        ],
        words
      ).map((s) => [s.at, s.title])
    ).toEqual([
      [0, "Intro"],
      [55.5, "Setup"],
    ]);
  });
});

describe("operationsForSuggestions", () => {
  const suggestions = [
    { at: 0, title: "Welcome", excerpt: "", onShot: false },
    { at: 55.5, title: "Setup", excerpt: "", onShot: false },
    { at: 120, title: "Pricing", excerpt: "", onShot: true },
  ];

  it("names the first scene, splits at the rest and numbers a card for each", () => {
    const { added, removedIds } = operationsForSuggestions(suggestions, [], { withCards: true, source: "ai" });
    expect(removedIds).toEqual([]);
    expect(added.map((op) => (op.type === "split" ? ["split", op.timestamp, op.title] : ["card", op.type === "card" && op.at, op.type === "card" && op.subtitle]))).toEqual([
      ["split", 0, "Welcome"],
      ["split", 55.5, "Setup"],
      ["card", 55.5, "Part 2"],
      ["split", 120, "Pricing"],
      ["card", 120, "Part 3"],
    ]);
  });

  it("renames an existing split nearby instead of adding a sliver, and skips cards that exist", () => {
    const existing: EditOperation[] = [
      { id: "old", type: "split", timestamp: 55, createdAt: 0 },
      { id: "card", type: "card", at: 55, duration: 3, template: "title", title: "Mine", background: "#000000", createdAt: 0 },
    ];
    const { added, removedIds } = operationsForSuggestions(suggestions.slice(0, 2), existing, {
      withCards: true,
      source: "ai",
    });
    expect(removedIds).toEqual(["old"]);
    expect(added).toEqual([
      expect.objectContaining({ type: "split", timestamp: 0 }),
      expect.objectContaining({ type: "split", timestamp: 55, title: "Setup" }),
    ]);
  });

  it("adds no cards when they're turned off", () => {
    const { added } = operationsForSuggestions(suggestions, [], { withCards: false, source: "manual" });
    expect(added.every((op) => op.type === "split")).toBe(true);
  });
});
