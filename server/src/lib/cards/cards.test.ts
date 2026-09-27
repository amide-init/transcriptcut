import { describe, expect, it } from "vitest";
import { toCardsAss } from "@/lib/cards/ass";
import { cardTextColor, cardTextOpacity, layoutCard } from "@/lib/cards/layout";
import type { CardOperation } from "@/types/edit-operation";

const card: CardOperation = {
  id: "c1",
  type: "card",
  at: 0,
  duration: 3,
  template: "chapter",
  title: "Pricing",
  subtitle: "Part 2",
  background: "#111418",
  createdAt: 0,
};

describe("layoutCard", () => {
  it("puts a chapter's kicker above the title, uppercased", () => {
    expect(layoutCard(card).map((l) => [l.text, l.anchor])).toEqual([
      ["PART 2", "above"],
      ["Pricing", "below"],
    ]);
  });

  it("centers a lone title when there's no subtitle", () => {
    expect(layoutCard({ template: "title", title: "Welcome" })).toEqual([
      expect.objectContaining({ text: "Welcome", anchor: "center", yPercent: 50 }),
    ]);
  });

  it("quotes a quote and attributes it", () => {
    expect(layoutCard({ template: "quote", title: "Ship it", subtitle: "Ada" }).map((l) => l.text)).toEqual([
      "“Ship it”",
      "— Ada",
    ]);
  });
});

describe("cardTextColor", () => {
  it("uses white on dark backgrounds and near-black on light ones", () => {
    expect(cardTextColor("#111418")).toBe("#FFFFFF");
    expect(cardTextColor("#F5F0E6")).toBe("#111111");
  });
});

describe("cardTextOpacity", () => {
  it("fades in, holds, and fades out", () => {
    expect(cardTextOpacity(0, 3)).toBe(0);
    expect(cardTextOpacity(1.5, 3)).toBe(1);
    expect(cardTextOpacity(3, 3)).toBe(0);
  });
});

describe("toCardsAss", () => {
  const ass = toCardsAss([{ start: 12.5, card }], { width: 1920, height: 1080 });

  it("uses the output size as the script resolution", () => {
    expect(ass).toContain("PlayResX: 1920\nPlayResY: 1080");
  });

  it("times each line to the card's slot on the program timeline", () => {
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(events).toHaveLength(2);
    for (const e of events) expect(e).toContain("0:00:12.50,0:00:15.50");
  });

  it("positions lines as percentages of the frame, in white on a dark card", () => {
    expect(ass).toContain("\\an8\\pos(960,497)\\fs86\\b1");
    expect(ass).toContain("\\c&HFFFFFF&");
  });

  it("strips override-tag characters from card text", () => {
    const out = toCardsAss([{ start: 0, card: { ...card, title: "a{\\fs999}b" } }], { width: 1920, height: 1080 });
    expect(out).toContain("}afs999b");
  });
});
