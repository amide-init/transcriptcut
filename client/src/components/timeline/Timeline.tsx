"use client";

import { useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import {
  computePlayableRanges,
  editedTimeToSourceTime,
  getEditedDuration,
  sourceTimeToEditedTime,
} from "@/lib/timeline/cuts";
import { detectSilences, type SilenceGap } from "@/lib/timeline/silence";
import { formatTimecode } from "@/lib/timeline/format";
import { useWaveform } from "@/lib/timeline/useWaveform";
import { Button } from "@/components/ui/button";
import { Waveform } from "@/components/timeline/Waveform";
import type { CutOperation } from "@/types/edit-operation";

export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [silenceGaps, setSilenceGaps] = useState<SilenceGap[] | null>(null);

  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  const transcript = useTranscriptStore((s) => s.transcript);

  const videoUrl = useProjectStore((s) => s.videoUrl);
  const audioBuffer = useWaveform(videoUrl);

  const operations = useTimelineStore((s) => s.operations);
  const addCut = useTimelineStore((s) => s.addCut);
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

  const handleFindSilences = () => {
    if (!transcript) return;
    setSilenceGaps(detectSilences(transcript));
  };

  const handleRemoveSilences = () => {
    if (!silenceGaps) return;
    for (const gap of silenceGaps) {
      addCut(gap.start, gap.end, "long pause");
    }
    setSilenceGaps(null);
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
          {silenceGaps && silenceGaps.length > 0 ? (
            <>
              <Button variant="ghost" size="xs" onClick={() => setSilenceGaps(null)}>
                Dismiss
              </Button>
              <Button variant="destructive" size="xs" onClick={handleRemoveSilences}>
                Remove {silenceGaps.length === 1 ? "1 pause" : `${silenceGaps.length} pauses`}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={handleFindSilences}
              disabled={!transcript}
            >
              {silenceGaps ? "No long pauses found" : "Find long pauses"}
            </Button>
          )}
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
        {silenceGaps?.map((gap, i) => {
          const left = (sourceTimeToEditedTime(gap.start, playableRanges) / editedDuration) * 100;
          const right = (sourceTimeToEditedTime(gap.end, playableRanges) / editedDuration) * 100;
          return (
            <div
              key={i}
              className="pointer-events-none absolute top-0 h-full bg-muted-foreground/50"
              style={{ left: `${left}%`, width: `${right - left}%` }}
              title={`Long pause: ${(gap.end - gap.start).toFixed(1)}s`}
            />
          );
        })}
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-primary"
          style={{ left: `${playheadPosition}%` }}
        />
      </div>
      {audioBuffer && editedDuration > 0 && (
        <div className="flex h-8 w-full overflow-hidden rounded-md bg-muted">
          {playableRanges.map((r, i) => (
            <div
              key={i}
              style={{ width: `${((r.end - r.start) / editedDuration) * 100}%` }}
              className="h-full border-r border-background last:border-r-0"
            >
              <Waveform buffer={audioBuffer} start={r.start} end={r.end} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
