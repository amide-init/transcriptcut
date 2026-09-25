"use client";

import { useTimelineStore } from "@/stores/timeline-store";
import type { TransitionKind, TransitionOperation } from "@/types/edit-operation";

const DURATIONS = [0.5, 1, 1.5, 2];
const selectClass =
  "h-6 rounded border border-border bg-transparent px-1 text-[0.7rem] text-foreground focus:border-primary focus:outline-none";

/**
 * Picks the transition at one moment: into a scene (dip or, when the scene
 * has a title card, crossfade), or the episode's fade in (at 0) / fade out
 * (at the end), which only dip. One operation per moment; choosing "None"
 * removes it. Every change is one undo step.
 */
export function TransitionPicker({
  label,
  at,
  current,
  edge,
  canCrossfade = false,
}: {
  label: string;
  at: number;
  current: TransitionOperation | undefined;
  /** The episode's start or end: dips only, worded as fades. */
  edge?: "in" | "out";
  canCrossfade?: boolean;
}) {
  const addOperations = useTimelineStore((s) => s.addOperations);
  const replaceOperation = useTimelineStore((s) => s.replaceOperation);
  const removeOperations = useTimelineStore((s) => s.removeOperations);

  const save = (kind: TransitionKind | "none", duration: number) => {
    if (kind === "none") {
      if (current) removeOperations([current.id]);
      return;
    }
    const next: TransitionOperation = {
      id: crypto.randomUUID(),
      type: "transition",
      at,
      kind,
      duration,
      createdAt: Date.now(),
    };
    if (current) replaceOperation(current.id, next);
    else addOperations([next]);
  };

  const kind = current?.kind ?? "none";
  const duration = current?.duration ?? 1;
  const toward = edge === "in" ? "from" : edge === "out" ? "to" : "via";

  return (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <select
        value={kind === "crossfade" && !canCrossfade ? "none" : kind}
        onChange={(e) => save(e.target.value as TransitionKind | "none", duration)}
        className={`${selectClass} min-w-0 flex-1`}
        aria-label={label}
      >
        <option value="none">None</option>
        <option value="dipBlack">{edge ? `Fade ${toward} black` : "Dip to black"}</option>
        <option value="dipWhite">{edge ? `Fade ${toward} white` : "Dip to white"}</option>
        {!edge && (
          <option value="crossfade" disabled={!canCrossfade}>
            {canCrossfade ? "Crossfade with card" : "Crossfade (needs a title card)"}
          </option>
        )}
      </select>
      {current && (
        <select
          value={duration}
          onChange={(e) => save(current.kind, Number(e.target.value))}
          className={selectClass}
          aria-label={`${label} length`}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d}s
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
