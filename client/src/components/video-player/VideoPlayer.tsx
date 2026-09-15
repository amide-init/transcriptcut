"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { computePlayableRanges, isCut, nextPlayableTime } from "@/lib/timeline/cuts";
import { getFilterPreset } from "@/lib/video/filters";
import type { CutOperation } from "@/types/edit-operation";

export function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTarget = usePlayerStore((s) => s.seekTarget);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const clearSeekTarget = usePlayerStore((s) => s.clearSeekTarget);
  const setVideoElement = usePlayerStore((s) => s.setVideoElement);

  const filterId = useProjectStore((s) => s.filterId);
  const filterCss = getFilterPreset(filterId).css;

  const operations = useTimelineStore((s) => s.operations);
  const cuts = operations.filter((op): op is CutOperation => op.type === "cut");
  const playableRanges = computePlayableRanges(duration, cuts);

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
      setDuration(video.duration);
    }
  }, [videoUrl, setDuration]);

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
    <video
      ref={videoRef}
      src={videoUrl}
      controls
      className="h-full w-full bg-black"
      style={{ filter: filterCss }}
      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      onTimeUpdate={handleTimeUpdate}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      data-playing={isPlaying}
    />
  );
}
