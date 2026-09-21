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
});
