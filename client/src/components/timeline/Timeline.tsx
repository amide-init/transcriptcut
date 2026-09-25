"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { editedTimeToSourceTime, sourceTimeToEditedTime } from "@/lib/timeline/cuts";
import { editedToProgramTime, itemStartTimes, locateProgramTime, programItemDuration } from "@/lib/timeline/program";
import { programPlayhead, useProgram } from "@/lib/timeline/useProgram";
import { formatTimecode } from "@/lib/timeline/format";
import { useWaveform } from "@/lib/timeline/useWaveform";
import { DEFAULT_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, useThumbnails } from "@/lib/timeline/useThumbnails";
import { cardTextColor } from "@/lib/cards/layout";
import { Button } from "@/components/ui/button";
import { Waveform } from "@/components/timeline/Waveform";
import { useScenes } from "@/lib/timeline/useScenes";
import { useSceneSuggestionStore } from "@/stores/scene-suggestion-store";
import { sceneColor } from "@/lib/timeline/scenes";
import { Scissors } from "lucide-react";

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
  const card = usePlayerStore((s) => s.card);
  const seek = usePlayerStore((s) => s.seek);
  const setCard = usePlayerStore((s) => s.setCard);

  const silenceGaps = useTranscriptStore((s) => s.silenceGaps);

  const videoUrl = useProjectStore((s) => s.videoUrl);
  const audioUrl = useProjectStore((s) => s.audioUrl);
  // Prefer the small extracted speech track; projects transcribed before it
  // existed fall back to decoding the video's own audio.
  const audioBuffer = useWaveform(audioUrl ?? videoUrl);

  const undo = useTimelineStore((s) => s.undo);
  const redo = useTimelineStore((s) => s.redo);
  const undoStack = useTimelineStore((s) => s.undoStack);
  const redoStack = useTimelineStore((s) => s.redoStack);
  const { scenes, splitAt } = useScenes();
  const suggestions = useSceneSuggestionStore((s) => s.suggestions);
  const shots = useSceneSuggestionStore((s) => s.shots);

  // Everything on the track is laid out on program time: kept footage with
  // title cards in between (lib/timeline/program.ts).
  const program = useProgram();
  const { cuts, ranges: playableRanges, slots } = program;
  const totalDuration = program.duration;
  const programTime = programPlayhead(program, currentTime, card);
  const playheadPosition = totalDuration > 0 ? (programTime / totalDuration) * 100 : 0;
  const itemStarts = useMemo(() => itemStartTimes(program.items), [program.items]);
  /** Percent across the track of a source time (after any card at that moment unless noted). */
  const percentAt = (sourceTime: number, includeCardsAtPoint = true) =>
    (editedToProgramTime(sourceTimeToEditedTime(sourceTime, playableRanges), slots, { includeCardsAtPoint }) /
      totalDuration) *
    100;

  // Establish the "fit the whole timeline, no scrolling" baseline (zoom 1x) once we
  // know both the program duration and the scroll container's actual width. Only set
  // once per video -- re-measuring on every edit would reset the user's zoom level.
  useEffect(() => {
    if (fitPxPerSecond !== null || totalDuration <= 0 || !scrollContainerRef.current) return;
    setFitPxPerSecond(scrollContainerRef.current.clientWidth / totalDuration);
  }, [totalDuration, fitPxPerSecond]);

  const pxPerSecond = fitPxPerSecond !== null ? fitPxPerSecond * zoom : 0;
  const trackWidth = pxPerSecond > 0 ? totalDuration * pxPerSecond : 0;

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

  /**
   * Thumbnails are grabbed per playable range; a card inserted mid-range
   * splits it into two source items, so each item shows its share of its
   * range's filmstrip.
   */
  const itemThumbnails = useMemo(
    () =>
      program.items.map((item) => {
        if (item.kind === "card") return [];
        const rangeIndex = playableRanges.findIndex((r) => item.start >= r.start - 0.001 && item.start < r.end);
        const range = playableRanges[rangeIndex];
        const strip = thumbnails[rangeIndex];
        if (!range || !strip) return [];
        const length = range.end - range.start;
        const from = Math.floor(((item.start - range.start) / length) * strip.length);
        const to = Math.ceil(((item.end - range.start) / length) * strip.length);
        return strip.slice(from, Math.max(from + 1, to));
      }),
    [program.items, playableRanges, thumbnails]
  );

  // Keep the playhead in view as it moves during playback, and when zoom changes.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pxPerSecond <= 0) return;
    const playheadPx = programTime * pxPerSecond;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (playheadPx < visibleLeft || playheadPx > visibleRight) {
      container.scrollTo({ left: Math.max(0, playheadPx - container.clientWidth / 2), behavior: "smooth" });
    }
  }, [programTime, pxPerSecond]);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP));

  /** Shows a card in the player, paused on its first frame. */
  const openCard = (cardId: string, elapsed = 0) => {
    const slot = slots.find((s) => s.card.id === cardId);
    if (!slot) return;
    seek(slot.resumeAt);
    setCard({ id: cardId, elapsed });
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || totalDuration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const target = locateProgramTime(ratio * totalDuration, slots);
    if (target.card) openCard(target.card.card.id, target.cardOffset);
    else seek(editedTimeToSourceTime(target.editedTime, playableRanges));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.8rem] text-muted-foreground">Timeline</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimecode(programTime)} / {formatTimecode(totalDuration)}
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
            disabled={undoStack.length === 0}
            title="Undo (⌘Z)"
          >
            Undo
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => splitAt(currentTime)}
            disabled={duration <= 0}
            title="Split into a new scene at the playhead (S)"
          >
            <Scissors className="size-3" />
            Split
          </Button>
          <Button variant="outline" size="xs" onClick={redo} disabled={redoStack.length === 0} title="Redo (⇧⌘Z)">
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
          {scenes.length > 1 && totalDuration > 0 && (
            <div className="relative h-5 w-full">
              {scenes.map((scene) => {
                if (scene.editedEnd - scene.editedStart <= 0) return null;
                // A scene's block starts at its card, so the card reads as part of the scene.
                const left = scene.index === 0 ? 0 : percentAt(scene.start, false);
                const right = percentAt(scene.end, false);
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => seek(scene.start)}
                    title={`${scene.title} (${formatTimecode(scene.editedEnd - scene.editedStart)})`}
                    className={`absolute top-0 h-full truncate rounded-sm border-l-2 px-1.5 text-left text-[0.65rem] leading-5 text-foreground hover:brightness-125 ${
                      sceneColor(scene.index).block
                    }`}
                    style={{ left: `${left}%`, width: `${(scene.index === scenes.length - 1 ? 100 : right) - left}%` }}
                  >
                    {scene.title}
                  </button>
                );
              })}
            </div>
          )}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative flex h-24 w-full cursor-pointer overflow-hidden rounded-md border border-border bg-muted p-1.5"
          >
            {program.items.map((item, i) =>
              item.kind === "card" ? (
                <div
                  key={`card-${item.card.id}`}
                  style={{
                    width: `${(item.card.duration / totalDuration) * 100}%`,
                    backgroundColor: item.card.background,
                    color: cardTextColor(item.card.background),
                  }}
                  className={`flex h-full items-center justify-center overflow-hidden rounded-sm border-r border-background px-1 text-center text-[0.65rem] leading-tight font-semibold last:border-r-0 ${
                    card?.id === item.card.id ? "ring-2 ring-primary ring-inset" : ""
                  }`}
                  title={`Title card: ${item.card.title} (${item.card.duration}s)`}
                >
                  <span className="line-clamp-3">{item.card.title}</span>
                </div>
              ) : (
                <div
                  key={`src-${i}-${item.start}`}
                  style={{ width: `${((item.end - item.start) / totalDuration) * 100}%` }}
                  className="flex h-full overflow-hidden rounded-sm border-r border-background bg-secondary last:border-r-0"
                  title={`${item.start.toFixed(1)}s – ${item.end.toFixed(1)}s`}
                >
                  {itemThumbnails[i]?.map((src, k) => (
                    <img
                      key={k}
                      src={src}
                      alt=""
                      className="h-full flex-1 border-r border-background/70 object-cover last:border-r-0"
                      draggable={false}
                    />
                  ))}
                </div>
              )
            )}
            {silenceGaps?.map((gap, i) => {
              const left = percentAt(gap.start);
              const right = percentAt(gap.end, false);
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute top-0 h-full bg-muted-foreground/50"
                  style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                  title={`Long pause: ${(gap.end - gap.start).toFixed(1)}s`}
                />
              );
            })}
            {/* Transitions: a diamond on each styled join, a wedge where the episode fades in or out. */}
            {program.joins.map((join, j) => {
              if (join.kind === "cut") return null;
              const at = itemStarts[j + 1];
              const label =
                join.kind === "crossfade" ? "Crossfade" : join.color === "white" ? "Dip to white" : "Dip to black";
              return (
                <div
                  key={`join-${j}`}
                  className="pointer-events-none absolute top-1 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border border-background bg-primary"
                  style={{ left: `${(at / totalDuration) * 100}%` }}
                  title={`${label} (${join.seconds}s)`}
                />
              );
            })}
            {program.fadeIn && (
              <div
                className="pointer-events-none absolute top-0 left-0 h-full bg-gradient-to-r from-black/70 to-transparent"
                style={{ width: `${(program.fadeIn.seconds / totalDuration) * 100}%` }}
              />
            )}
            {program.fadeOut && (
              <div
                className="pointer-events-none absolute top-0 right-0 h-full bg-gradient-to-l from-black/70 to-transparent"
                style={{ width: `${(program.fadeOut.seconds / totalDuration) * 100}%` }}
              />
            )}
            {/* Suggestions under review (dashed) and detected shot changes (ticks) -- not edits yet. */}
            {shots?.map((t) => (
              <div
                key={`shot-${t}`}
                className="pointer-events-none absolute bottom-0 h-2 w-px bg-foreground/50"
                style={{ left: `${percentAt(t)}%` }}
              />
            ))}
            {suggestions
              ?.filter((s) => s.keep && s.at > 0)
              .map((s) => (
                <div
                  key={`suggestion-${s.key}`}
                  className="pointer-events-none absolute top-0 h-full border-l-2 border-dashed border-primary"
                  style={{ left: `${percentAt(s.at, false)}%` }}
                  title={`Suggested scene: ${s.title}`}
                />
              ))}
            {scenes.slice(1).map((scene) => (
              <div
                key={scene.id}
                className="pointer-events-none absolute top-0 h-full w-px bg-foreground/70"
                style={{ left: `${percentAt(scene.start, false)}%` }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-0 h-full w-0.5 bg-primary"
              style={{ left: `${playheadPosition}%` }}
            />
          </div>
          {program.overlays.length > 0 && totalDuration > 0 && (
            <div className="relative h-4 w-full rounded-sm bg-muted/60" aria-label="B-roll">
              {program.overlays.map(({ overlay, start, end }) => (
                <button
                  key={overlay.id}
                  type="button"
                  onClick={() => seek(overlay.start)}
                  title={`B-roll, ${overlay.mode === "full" ? "full screen" : "picture in picture"} (${formatTimecode(end - start)})`}
                  className={`absolute top-0.5 h-3 rounded-sm border hover:brightness-125 ${
                    overlay.mode === "full" ? "border-sky-400 bg-sky-500/60" : "border-sky-400 bg-sky-500/25"
                  }`}
                  style={{ left: `${(start / totalDuration) * 100}%`, width: `${((end - start) / totalDuration) * 100}%` }}
                />
              ))}
            </div>
          )}
          {audioBuffer && totalDuration > 0 && (
            <div className="flex h-12 w-full overflow-hidden rounded-md border border-border bg-muted p-1.5">
              {program.items.map((item, i) => (
                <div
                  key={i}
                  style={{ width: `${(programItemDuration(item) / totalDuration) * 100}%` }}
                  className="h-full border-r border-background last:border-r-0"
                >
                  {item.kind === "source" && (
                    <Waveform buffer={audioBuffer} start={item.start} end={item.end} pxPerSecond={pxPerSecond} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
