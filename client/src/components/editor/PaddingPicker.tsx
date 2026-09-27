"use client";

import { useEffect, useRef, useState } from "react";
import { useTimelineStore } from "@/stores/timeline-store";
import { CARD_BACKGROUNDS } from "@/lib/cards/layout";
import type { PadOperation } from "@/types/edit-operation";

const SIZES = [
  { value: 5, label: "Small" },
  { value: 10, label: "Medium" },
  { value: 15, label: "Large" },
  { value: 20, label: "Extra large" },
];
/** A dragged color picker fires on every move; wait for it to settle before saving. */
const COLOR_SETTLE_MS = 400;
const selectClass =
  "h-6 rounded border border-border bg-transparent px-1 text-[0.7rem] text-foreground focus:border-primary focus:outline-none";

/**
 * Picks the frame padding for the scene starting at `at`: the footage
 * shrinks by the chosen size on each side and sits on a solid border. One
 * operation per scene; choosing "None" removes it. Every change is one
 * undo step.
 */
export function PaddingPicker({ at, current }: { at: number; current: PadOperation | undefined }) {
  const addOperations = useTimelineStore((s) => s.addOperations);
  const replaceOperation = useTimelineStore((s) => s.replaceOperation);
  const removeOperations = useTimelineStore((s) => s.removeOperations);
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const save = (size: number | null, color: string) => {
    if (size === null) {
      if (current) removeOperations([current.id]);
      return;
    }
    const next: PadOperation = { id: crypto.randomUUID(), type: "pad", at, size, color, createdAt: Date.now() };
    if (current) replaceOperation(current.id, next);
    else addOperations([next]);
  };

  const color = draftColor ?? current?.color ?? CARD_BACKGROUNDS[0];

  const pickColor = (next: string) => {
    setDraftColor(next);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      setDraftColor(null);
      if (current) save(current.size, next);
    }, COLOR_SETTLE_MS);
  };

  return (
    <div className="flex flex-col gap-1 text-muted-foreground">
      <label className="flex items-center gap-1.5">
        <span className="shrink-0">Padding</span>
        <select
          value={current?.size ?? "none"}
          onChange={(e) => save(e.target.value === "none" ? null : Number(e.target.value), color)}
          className={`${selectClass} min-w-0 flex-1`}
          aria-label="Padding"
        >
          <option value="none">None</option>
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label} ({s.value}%)
            </option>
          ))}
        </select>
      </label>
      {current && (
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">Border</span>
          {CARD_BACKGROUNDS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => save(current.size, swatch)}
              title={swatch}
              className={`size-4 rounded-full border ${
                color.toUpperCase() === swatch ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "border-border"
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => pickColor(e.target.value)}
            aria-label="Custom border color"
            className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent"
          />
        </div>
      )}
    </div>
  );
}
