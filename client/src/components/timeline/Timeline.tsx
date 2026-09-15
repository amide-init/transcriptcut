"use client";

import { useMemo, useRef } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import {
  computePlayableRanges,
  editedTimeToSourceTime,
  getEditedDuration,
  sourceTimeToEditedTime,
} from "@/lib/timeline/cuts";
import { Button } from "@/components/ui/button";
import type { CutOperation } from "@/types/edit-operation";

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null);

  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  const operations = useTimelineStore((s) => s.operations);
  const undo = useTimelineStore((s) => s.undo);
  const redo = useTimelineStore((s) => s.redo);
  const redoStack = useTimelineStore((s) => s.redoStack);

  const cuts = useMemo(
    () => operations.filter((op): op is CutOperation => op.type === "cut"),
    [operations]
  );
  const playableRanges = useMemo(
    () => computePlayableRanges(duration, cuts),
    [duration, cuts]
  );
  const editedDuration = getEditedDuration(playableRanges);
  const editedCurrentTime =
    editedDuration > 0 ? sourceTimeToEditedTime(currentTime, playableRanges) : 0;
  const playheadPosition = editedDuration > 0 ? (editedCurrentTime / editedDuration) * 100 : 0;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || editedDuration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const sourceTime = editedTimeToSourceTime(ratio * editedDuration, playableRanges);
    seek(sourceTime);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.8rem] text-muted-foreground">Timeline</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimecode(editedCurrentTime)} / {formatTimecode(editedDuration)}
            {cuts.length > 0 && (
              <span className="text-destructive/80">
                {" "}
                ({cuts.length} cut{cuts.length === 1 ? "" : "s"})
              </span>
            )}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={undo}
            disabled={operations.length === 0}
          >
            Undo
          </Button>
          <Button variant="outline" size="xs" onClick={redo} disabled={redoStack.length === 0}>
            Redo
          </Button>
        </div>
      </div>
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative flex h-11 w-full cursor-pointer overflow-hidden rounded-md bg-muted"
      >
        {playableRanges.map((r, i) => (
          <div
            key={i}
            style={{ width: `${((r.end - r.start) / editedDuration) * 100}%` }}
            className="h-full border-r border-background bg-secondary last:border-r-0"
            title={`${r.start.toFixed(1)}s – ${r.end.toFixed(1)}s`}
          />
        ))}
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-primary"
          style={{ left: `${playheadPosition}%` }}
        />
      </div>
    </div>
  );
}
