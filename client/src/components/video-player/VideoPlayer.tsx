"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useProjectStore } from "@/stores/project-store";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { CAPTION_MARGIN_V_PERCENT, type CaptionPosition } from "@/lib/captions/style";
import {
  computePlayableRanges,
  editedTimeToSourceTime,
  getEditedDuration,
  isCut,
  nextPlayableTime,
  sourceTimeToEditedTime,
} from "@/lib/timeline/cuts";
import { generateCaptions } from "@/lib/captions/generate";
import { formatTimecode } from "@/lib/timeline/format";
import { getFilterPreset } from "@/lib/video/filters";
import { buildPropertiesCss, buildPropertiesSvgValues } from "@/lib/video/properties";
import { logoPositionToCss } from "@/lib/video/logo";
import { CropOverlay } from "@/components/video-player/CropOverlay";
import type { CutOperation } from "@/types/edit-operation";

/**
 * Approximates libass's numpad-alignment vertical placement (see
 * lib/captions/style.ts). `cqh` ties the inset to CAPTION_MARGIN_V_PERCENT
 * of the *video container's* own height (via `container-type: size` on
 * that container below), matching the export's MarginV -- which is also a
 * percent of frame height, just realized in ASS's own coordinate space --
 * instead of a fixed on-screen px offset that meant a different fraction
 * of the frame depending on how big the preview happened to be rendered.
 */
const CAPTION_VERTICAL_STYLE: Record<CaptionPosition, CSSProperties> = {
  top: { top: `${CAPTION_MARGIN_V_PERCENT}cqh` },
  middle: { top: "50%", transform: "translateY(-50%)" },
  bottom: { bottom: `${CAPTION_MARGIN_V_PERCENT}cqh` },
};

export function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const setAspectRatio = usePlayerStore((s) => s.setAspectRatio);

  const filterId = useProjectStore((s) => s.filterId);
  const properties = useProjectStore((s) => s.properties);
  // Highlights/shadows/temperature/tint have no CSS `filter` primitive, so
  // they're applied via an inline SVG <filter> (rendered below) referenced
  // as a `url(#id)` term alongside the plain CSS functions -- see
  // lib/video/properties.ts#buildPropertiesSvgValues for what's exact vs
  // approximate about it.
  const svgFilterRawId = useId();
  const svgFilterId = `video-properties-filter-${svgFilterRawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const svgValues = buildPropertiesSvgValues(properties);
  const svgFilterNeeded = properties.highlights !== 0 || properties.shadows !== 0 || properties.temperature !== 0 || properties.tint !== 0;
  const filterCss = [
    getFilterPreset(filterId).css,
    buildPropertiesCss(properties),
    svgFilterNeeded ? `url(#${svgFilterId})` : "",
  ]
    .filter((v) => v && v !== "none")
    .join(" ");

  const logoUrl = useProjectStore((s) => s.logoUrl);
  const logoPosition = useProjectStore((s) => s.logoPosition);
  const logoPaddingX = useProjectStore((s) => s.logoPaddingX);
  const logoPaddingY = useProjectStore((s) => s.logoPaddingY);
  const logoOpacity = useProjectStore((s) => s.logoOpacity);
  const persistDuration = useProjectStore((s) => s.setDuration);
  const durationPersisted = useRef(false);

  const handleDurationKnown = (video: HTMLVideoElement) => {
    setDuration(video.duration);
    if (video.videoWidth && video.videoHeight) {
      setAspectRatio(video.videoWidth / video.videoHeight);
    }
    if (!durationPersisted.current) {
      durationPersisted.current = true;
      persistDuration(video.duration);
    }
  };

  const operations = useTimelineStore((s) => s.operations);
  const cuts = operations.filter((op): op is CutOperation => op.type === "cut");
  const playableRanges = computePlayableRanges(duration, cuts);
  const editedDuration = getEditedDuration(playableRanges);
  const editedCurrentTime =
    editedDuration > 0 ? sourceTimeToEditedTime(currentTime, playableRanges) : 0;
  const playheadPosition = editedDuration > 0 ? (editedCurrentTime / editedDuration) * 100 : 0;

  const transcript = useTranscriptStore((s) => s.transcript);
  const captionCues = transcript && duration > 0 ? generateCaptions(transcript, cuts, duration) : [];
  const activeCue = captionCues.find(
    (c) => editedCurrentTime >= c.start && editedCurrentTime < c.end
  );
  const captionStyle = useCaptionStyleStore((s) => s.style);
  const burnInCaptions = useCaptionStyleStore((s) => s.burnInCaptions);

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
      handleDurationKnown(video);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  // Expose the live node so other UI (e.g. the filter drawer) can grab a
  // frame for a thumbnail without lifting the ref through props.
  useEffect(() => {
    setVideoElement(videoRef.current);
    return () => setVideoElement(null);
  }, [setVideoElement]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  };

  // Frame-accurate cut-skip: the native `timeupdate` event (used as the
  // fallback in handleTimeUpdate below) isn't guaranteed to fire every
  // rendered frame, so a frame or two from inside a cut region can paint
  // before that handler catches up -- a brief visible flash right at the
  // cut. requestVideoFrameCallback fires on every actually-presented
  // frame with its true media time, closing that gap. Not supported in
  // Firefox as of writing, hence the feature check -- handleTimeUpdate's
  // own isCut check (only gated off when this IS supported, see below)
  // covers that fallback case.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !("requestVideoFrameCallback" in video)) return;

    let handle: number | null = null;
    // While a seek we issued is still settling, requestVideoFrameCallback
    // keeps firing for the frames in between -- each one can still report
    // a stale (pre-seek) mediaTime that reads as "cut," which without this
    // guard re-triggers the same seek again on every one of those frames
    // (rVFC fires far more often than the old timeupdate-based check ever
    // did). Repeatedly re-issuing video.currentTime in a tight loop like
    // that is what produced the "freezes, audio crackles for a few
    // seconds" symptom -- so once we seek to a target, don't seek again
    // until a frame's mediaTime actually reaches it, confirming the
    // previous seek settled. Safe even if it never lands exactly on the
    // target: normal forward playback advances mediaTime past it within a
    // few frames regardless.
    let pendingSeekTarget: number | null = null;
    // Caps how many frames we'll wait for a pending seek to settle before
    // giving up on it -- without this, a seek that (for whatever reason,
    // e.g. paused/at the end) never quite reaches its target would leave
    // the guard permanently skipping the cut check from then on.
    let pendingSeekFramesWaited = 0;
    const MAX_SEEK_SETTLE_FRAMES = 15;
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (pendingSeekTarget !== null && metadata.mediaTime < pendingSeekTarget) {
        pendingSeekFramesWaited++;
        if (pendingSeekFramesWaited < MAX_SEEK_SETTLE_FRAMES) {
          handle = video.requestVideoFrameCallback(onFrame);
          return;
        }
      }
      pendingSeekTarget = null;
      pendingSeekFramesWaited = 0;

      if (playableRanges.length > 0 && isCut(metadata.mediaTime, playableRanges)) {
        const next = nextPlayableTime(metadata.mediaTime, playableRanges);
        if (next === null) {
          video.pause();
        } else {
          pendingSeekTarget = next;
          video.currentTime = next;
        }
      }
      handle = video.requestVideoFrameCallback(onFrame);
    };
    handle = video.requestVideoFrameCallback(onFrame);

    return () => {
      if (handle !== null) video.cancelVideoFrameCallback(handle);
    };
  }, [playableRanges]);

  const supportsVideoFrameCallback =
    typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    // The effect above already handles this frame-accurately when supported.
    if (supportsVideoFrameCallback) return;
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
    <div ref={containerRef} className="flex h-full w-full flex-col bg-black">
      {svgFilterNeeded && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <filter id={svgFilterId} colorInterpolationFilters="sRGB">
              {/* Highlights: exact match to ffmpeg's colorlevels (see buildPropertiesSvgValues). */}
              <feComponentTransfer>
                <feFuncR type="linear" slope={svgValues.highlightsSlope} intercept={0} />
                <feFuncG type="linear" slope={svgValues.highlightsSlope} intercept={0} />
                <feFuncB type="linear" slope={svgValues.highlightsSlope} intercept={0} />
              </feComponentTransfer>
              {/* Shadows: approximate gamma lift, not an exact match -- see buildPropertiesSvgValues. */}
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude={1} exponent={svgValues.shadowsExponent} offset={0} />
                <feFuncG type="gamma" amplitude={1} exponent={svgValues.shadowsExponent} offset={0} />
                <feFuncB type="gamma" amplitude={1} exponent={svgValues.shadowsExponent} offset={0} />
              </feComponentTransfer>
              {/* Temperature/tint: approximate channel-offset shift, not an exact match -- see buildPropertiesSvgValues. */}
              <feColorMatrix type="matrix" values={svgValues.colorMatrix} />
            </filter>
          </defs>
        </svg>
      )}
      {/*
        container-type:size makes `cqh` units below resolve against THIS
        element's own rendered height (which already matches the video's
        aspect ratio -- see EditorLayout.tsx/player-store.ts), independent
        of the on-screen preview's actual pixel size. That's what lets the
        caption font-size/margin be a true frame-relative percent in CSS,
        the same way ffmpeg's PlayResY does for the export (GitHub #22).
      */}
      <div className="relative min-h-0 flex-1 overflow-hidden [container-type:size]">
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-contain"
          style={{ filter: filterCss }}
          onLoadedMetadata={(e) => handleDurationKnown(e.currentTarget)}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          data-playing={isPlaying}
        />
        <CropOverlay />
        {logoUrl && (
          <img
            src={logoUrl}
            alt=""
            // max-h/max-w % must match LOGO_MAX_HEIGHT_FRACTION/LOGO_MAX_WIDTH_FRACTION in lib/video/logo.ts, which the ffmpeg export scales the logo to match.
            className="pointer-events-none absolute max-h-[15%] max-w-[25%] object-contain"
            style={logoPositionToCss(logoPosition, logoPaddingX, logoPaddingY, logoOpacity)}
          />
        )}
        {burnInCaptions && activeCue && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
            style={CAPTION_VERTICAL_STYLE[captionStyle.position]}
          >
            <span
              className={`max-w-[90%] text-center font-medium ${captionStyle.background ? "rounded bg-black/70 px-2.5 py-1" : "px-1"}`}
              style={{
                fontFamily: captionStyle.font,
                fontSize: `${captionStyle.fontSize}cqh`,
                color: captionStyle.wordHighlight ? undefined : captionStyle.textColor,
                WebkitTextStroke: `1px ${captionStyle.outlineColor}`,
                textShadow: captionStyle.background
                  ? undefined
                  : `0 0 3px ${captionStyle.outlineColor}`,
              }}
            >
              {captionStyle.wordHighlight
                ? activeCue.words.map((w, i) => (
                    <span
                      key={i}
                      style={{
                        color:
                          editedCurrentTime >= w.start && editedCurrentTime < w.end
                            ? captionStyle.highlightColor
                            : captionStyle.textColor,
                      }}
                    >
                      {w.text}
                      {i < activeCue.words.length - 1 ? " " : ""}
                    </span>
                  ))
                : activeCue.text}
            </span>
          </div>
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-white/10 px-2">
        <button
          type="button"
          onClick={togglePlay}
          disabled={editedDuration <= 0}
          className="flex size-6 shrink-0 items-center justify-center rounded text-white hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
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
        <span className="font-mono text-xs tabular-nums text-white/70">
          {formatTimecode(editedCurrentTime)} / {formatTimecode(editedDuration)}
        </span>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-white hover:bg-white/10"
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex size-6 shrink-0 items-center justify-center rounded text-white hover:bg-white/10"
        >
          {isFullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
