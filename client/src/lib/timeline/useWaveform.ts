"use client";

import { useEffect, useState } from "react";

/**
 * Decodes the given video/audio URL's audio track client-side (Web Audio API)
 * for waveform rendering. Returns null while loading, on decode failure, or
 * if the source has no audio track — callers should treat that as "no
 * waveform to show" rather than an error.
 */
export function useWaveform(videoUrl: string | null): AudioBuffer | null {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    let cancelled = false;
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();

    (async () => {
      try {
        const res = await fetch(videoUrl);
        const arrayBuffer = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        if (!cancelled) setBuffer(decoded);
      } catch {
        // No audio track, unsupported codec, or decode failure — just skip the waveform.
      } finally {
        ctx.close();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  return buffer;
}
