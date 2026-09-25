import { describe, expect, it } from "vitest";
import { editOperationSchema } from "@/lib/validation/edit-operation";

describe("editOperationSchema", () => {
  it("accepts a valid cut operation", () => {
    const result = editOperationSchema.safeParse({
      id: "op1",
      type: "cut",
      start: 1,
      end: 2,
      createdAt: 1700000000000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cut with an optional reason", () => {
    const result = editOperationSchema.safeParse({
      id: "op1",
      type: "cut",
      start: 1,
      end: 2,
      reason: "filler word",
      createdAt: 1700000000000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid trim, split, and caption operation", () => {
    expect(
      editOperationSchema.safeParse({ id: "1", type: "trim", start: 0, end: 5, createdAt: 0 }).success
    ).toBe(true);
    expect(editOperationSchema.safeParse({ id: "1", type: "split", timestamp: 3, createdAt: 0 }).success).toBe(
      true
    );
    expect(
      editOperationSchema.safeParse({ id: "1", type: "caption", text: "hi", start: 0, end: 1, createdAt: 0 })
        .success
    ).toBe(true);
  });

  it("rejects a negative start/end", () => {
    expect(
      editOperationSchema.safeParse({ id: "1", type: "cut", start: -1, end: 2, createdAt: 0 }).success
    ).toBe(false);
  });

  it("rejects an unknown operation type", () => {
    expect(editOperationSchema.safeParse({ id: "1", type: "delete", start: 0, end: 1, createdAt: 0 }).success).toBe(
      false
    );
  });

  it("rejects a cut missing a required field", () => {
    expect(editOperationSchema.safeParse({ id: "1", type: "cut", start: 0, createdAt: 0 }).success).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(
      editOperationSchema.safeParse({ id: "", type: "cut", start: 0, end: 1, createdAt: 0 }).success
    ).toBe(false);
  });

  it("rejects a caption whose text exceeds the 2000-char limit", () => {
    const result = editOperationSchema.safeParse({
      id: "1",
      type: "caption",
      text: "a".repeat(2001),
      start: 0,
      end: 1,
      createdAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fields belonging to a different operation type (discriminated union)", () => {
    // "timestamp" belongs to split, not cut -- and cut is missing its own required end.
    const result = editOperationSchema.safeParse({ id: "1", type: "cut", start: 0, timestamp: 5, createdAt: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts a split with a scene title, source and group", () => {
    expect(
      editOperationSchema.safeParse({
        id: "1",
        type: "split",
        timestamp: 42.5,
        title: "Pricing",
        source: "ai",
        groupId: "g1",
        createdAt: 0,
      }).success
    ).toBe(true);
  });

  it("rejects an over-long scene title and an unknown split source", () => {
    const base = { id: "1", type: "split", timestamp: 3, createdAt: 0 };
    expect(editOperationSchema.safeParse({ ...base, title: "x".repeat(81) }).success).toBe(false);
    expect(editOperationSchema.safeParse({ ...base, source: "robot" }).success).toBe(false);
  });

  describe("card", () => {
    const card = {
      id: "c1",
      type: "card",
      at: 30,
      duration: 3,
      template: "chapter",
      title: "Part 2: Pricing",
      subtitle: "What it really costs",
      background: "#101820",
      createdAt: 0,
    };

    it("accepts a valid card", () => {
      expect(editOperationSchema.safeParse(card).success).toBe(true);
    });

    it("rejects out-of-range durations, unknown templates and bad colors", () => {
      expect(editOperationSchema.safeParse({ ...card, duration: 0.5 }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...card, duration: 11 }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...card, template: "spinning" }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...card, background: "red" }).success).toBe(false);
    });

    it("rejects an empty title and text that would be read as ASS override tags", () => {
      expect(editOperationSchema.safeParse({ ...card, title: "   " }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...card, title: "{\\fs200}Big" }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...card, subtitle: "two\nlines" }).success).toBe(false);
    });
  });

  describe("transition", () => {
    const transition = { id: "t1", type: "transition", at: 30, kind: "dipBlack", duration: 1, createdAt: 0 };

    it("accepts each kind", () => {
      for (const kind of ["dipBlack", "dipWhite", "crossfade"]) {
        expect(editOperationSchema.safeParse({ ...transition, kind }).success).toBe(true);
      }
    });

    it("rejects unknown kinds and out-of-range durations", () => {
      expect(editOperationSchema.safeParse({ ...transition, kind: "wipe" }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...transition, duration: 0.1 }).success).toBe(false);
      expect(editOperationSchema.safeParse({ ...transition, duration: 5 }).success).toBe(false);
    });
  });
});
