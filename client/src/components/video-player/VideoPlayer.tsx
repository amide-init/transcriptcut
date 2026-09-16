"use client";

import { useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import {
  computePlayableRanges,
  editedTimeToSourceTime,
  getEditedDuration,
  isCut,
  nextPlayableTime,
  sourceTimeToEditedTime,
} from "@/lib/timeline/cuts";
import { formatTimecode } from "@/lib/timeline/format";
import { getFilterPreset } from "@/lib/video/filters";
import type { CutOperation } from "@/types/edit-operation";

export function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const duration = usePlayerStore((s) => s.duration);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTarget = usePlayerStore((s) => s.seekTarget);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const seek = usePlayerStore((s) => s.seek);
  const clearSeekTarget = usePlayerStore((s) => s.clearSeekTarget);
  const setVideoElement = usePlayerStore((s) => s.setVideoElement);

  const filterId = useProjectStore((s) => s.filterId);
  const filterCss = getFilterPreset(filterId).css;
  const persistDuration = useProjectStore((s) => s.setDuration);
  const durationPersisted = useRef(false);

  const handleDurationKnown = (seconds: number) => {
    setDuration(seconds);
    if (!durationPersisted.current) {
      durationPersisted.current = true;
      persistDuration(seconds);
    }
  };

  const operations = useTimelineStore((s) => s.operations);
  const cuts = operations.filter((op): op is CutOperation => op.type === "cut");
  const playableRanges = computePlayableRanges(duration, cuts);
  const editedDuration = getEditedDuration(playableRanges);
  const editedCurrentTime =
    editedDuration > 0 ? sourceTimeToEditedTime(currentTime, playableRanges) : 0;
  const playheadPosition = editedDuration > 0 ? (editedCurrentTime / editedDuration) * 100 : 0;

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || editedDuration <= 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    seek(editedTimeToSourceTime(ratio * editedDuration, playableRanges));
  };

  // Handle imperative seeks requested elsewhere (transcript click, timeline click).
  useEffect(() => {
    if (seekTarget === null || !videoRef.current) return;
    videoRef.current.currentTime = seekTarget;
    clearSeekTarget();
  }, [seekTarget, clearSeekTarget]);

  // A blob-URL video can reach readyState >= HAVE_METADATA (and fire its
  // loadedmetadata event) before React finishes attaching the listener on
  // this mount, so the event alone can be missed — read it directly too.
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 1 && !Number.isNaN(video.duration)) {
      handleDurationKnown(video.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  // Expose the live node so other UI (e.g. the filter drawer) can grab a
  // frame for a thumbnail without lifting the ref through props.
  useEffect(() => {
    setVideoElement(videoRef.current);
    return () => setVideoElement(null);
  }, [setVideoElement]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (playableRanges.length === 0) return;
    if (isCut(video.currentTime, playableRanges)) {
      const next = nextPlayableTime(video.currentTime, playableRanges);
      if (next === null) {
        video.pause();
      } else {
        video.currentTime = next;
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full min-h-0 flex-1 object-contain"
        style={{ filter: filterCss }}
        onLoadedMetadata={(e) => handleDurationKnown(e.currentTarget.duration)}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        data-playing={isPlaying}
      />
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-white/10 px-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={editedDuration <= 0}
          className="flex size-6 shrink-0 items-center justify-center rounded text-white hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <span className="font-mono text-xs tabular-nums text-white/70">
          {formatTimecode(editedCurrentTime)} / {formatTimecode(editedDuration)}
        </span>
        <div
          ref={scrubberRef}
          onClick={handleScrubberClick}
          className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
        >
          <div
            className="pointer-events-none absolute top-1/2 size-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white"
            style={{ left: `${playheadPosition}%` }}
          />
        </div>
      </div>
    </div>
  );
}
