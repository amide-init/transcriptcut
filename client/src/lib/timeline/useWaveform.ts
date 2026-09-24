"use client";

import { useEffect, useState } from "react";

/**
 * Decodes the given video/audio URL's audio track client-side (Web Audio API)
 * for waveform rendering. Returns null while loading, on decode failure, or
 * if the source has no audio track — callers should treat that as "no
 * waveform to show" rather than an error.
 */
const WAVEFORM_SAMPLE_RATE = 8000;

export function useWaveform(videoUrl: string | null): AudioBuffer | null {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    // Abort (not just ignore) on unmount/videoUrl change -- this is a
    // whole-file fetch, and React invoking effects twice in dev (StrictMode)
    // would otherwise leave the first fetch running server-side to
    // completion for no reason, doubling load on a video route that's
    // already juggling concurrent Range requests from the <video> element.
    const controller = new AbortController();
    // Decode at a low sample rate: decodeAudioData resamples to the
    // context's rate, and a waveform only needs peak amplitudes. At the
    // default 48kHz a 2-hour episode decodes to ~1.4GB of float samples;
    // at 8kHz it's ~230MB.
    const ctx = new OfflineAudioContext(1, 1, WAVEFORM_SAMPLE_RATE);

    (async () => {
      try {
        const res = await fetch(videoUrl, { signal: controller.signal });
        const arrayBuffer = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        // decodeAudioData itself isn't abortable -- if videoUrl changed
        // while it was running, skip applying this now-stale result.
        if (!controller.signal.aborted) setBuffer(decoded);
      } catch {
        // Aborted, no audio track, unsupported codec, or decode failure — just skip the waveform.
      }
    })();

    return () => {
      controller.abort();
    };
  }, [videoUrl]);

  return buffer;
}
