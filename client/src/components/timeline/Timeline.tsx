"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatTimecode } from "@/lib/timeline/format";
import { useWaveform } from "@/lib/timeline/useWaveform";
import { DEFAULT_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, useThumbnails } from "@/lib/timeline/useThumbnails";
import { Button } from "@/components/ui/button";
import { Waveform } from "@/components/timeline/Waveform";
import type { CutOperation } from "@/types/edit-operation";

/** Zoom is relative to "fit" (1x = whole timeline visible, no scrolling). */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;

/** Roughly how wide a single thumbnail should render on screen, in px, at any zoom level. */
const TARGET_THUMBNAIL_DISPLAY_WIDTH_PX = 100;

export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [fitPxPerSecond, setFitPxPerSecond] = useState<number | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  const silenceGaps = useTranscriptStore((s) => s.silenceGaps);

  const videoUrl = useProjectStore((s) => s.videoUrl);
  const audioBuffer = useWaveform(videoUrl);

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

  // Establish the "fit the whole timeline, no scrolling" baseline (zoom 1x) once we
  // know both the edited duration and the scroll container's actual width. Only set
  // once per video -- re-measuring on every edit would reset the user's zoom level.
  useEffect(() => {
    if (fitPxPerSecond !== null || editedDuration <= 0 || !scrollContainerRef.current) return;
    setFitPxPerSecond(scrollContainerRef.current.clientWidth / editedDuration);
  }, [editedDuration, fitPxPerSecond]);

  const pxPerSecond = fitPxPerSecond !== null ? fitPxPerSecond * zoom : 0;
  const trackWidth = pxPerSecond > 0 ? editedDuration * pxPerSecond : 0;

  // Denser thumbnails as you zoom in -- targets a roughly constant on-screen
  // thumbnail width instead of the same fixed set of images stretching
  // wider (GitHub issue #26), clamped so zoom never makes them coarser than
  // the default (zoomed all the way out) or finer than 1s apart (max zoom).
  const thumbnailIntervalSeconds =
    pxPerSecond > 0
      ? Math.min(
          DEFAULT_INTERVAL_SECONDS,
          Math.max(MIN_INTERVAL_SECONDS, TARGET_THUMBNAIL_DISPLAY_WIDTH_PX / pxPerSecond)
        )
      : DEFAULT_INTERVAL_SECONDS;
  const thumbnails = useThumbnails(videoUrl, duration, cuts, thumbnailIntervalSeconds);

  // Keep the playhead in view as it moves during playback, and when zoom changes.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pxPerSecond <= 0) return;
    const playheadPx = editedCurrentTime * pxPerSecond;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (playheadPx < visibleLeft || playheadPx > visibleRight) {
      container.scrollTo({ left: Math.max(0, playheadPx - container.clientWidth / 2), behavior: "smooth" });
    }
  }, [editedCurrentTime, pxPerSecond]);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP));

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
          <div className="mx-1 flex items-center gap-0.5">
            <Button variant="outline" size="xs" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM}>
              −
            </Button>
            <span className="w-9 text-center font-mono text-[0.7rem] text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="xs" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM}>
              +
            </Button>
          </div>
        </div>
      </div>
      <div ref={scrollContainerRef} className="overflow-x-auto">
        <div
          className="flex flex-col gap-2"
          style={{ width: trackWidth > 0 ? `${trackWidth}px` : "100%" }}
        >
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative flex h-24 w-full cursor-pointer overflow-hidden rounded-md bg-muted"
          >
            {playableRanges.map((r, i) => (
              <div
                key={i}
                style={{ width: `${((r.end - r.start) / editedDuration) * 100}%` }}
                className="flex h-full overflow-hidden border-r border-background bg-secondary last:border-r-0"
                title={`${r.start.toFixed(1)}s – ${r.end.toFixed(1)}s`}
              >
                {thumbnails[i]?.map((src, k) => (
                  // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL, not a static asset
                  <img key={k} src={src} alt="" className="h-full flex-1 object-cover" draggable={false} />
                ))}
              </div>
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
            <div className="flex h-12 w-full overflow-hidden rounded-md bg-muted">
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
      </div>
    </div>
  );
}
