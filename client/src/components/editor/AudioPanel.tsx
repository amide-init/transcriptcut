"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { usePlayerStore } from "@/stores/player-store";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AUDIO_SETTINGS,
  PODCAST_AUDIO_PRESET,
  type AudioSettings,
  type DenoiseLevel,
  type LoudnessTarget,
} from "@/types/audio-settings";

const LOUDNESS_OPTIONS: { value: LoudnessTarget; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Keep the original level" },
  { value: "-16", label: "-16 LUFS", hint: "Podcast apps (Apple, Spotify podcasts)" },
  { value: "-14", label: "-14 LUFS", hint: "YouTube and music streaming" },
];

const DENOISE_OPTIONS: { value: DenoiseLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "light", label: "Light" },
  { value: "strong", label: "Strong" },
];

type PreviewState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "ready"; before: string; after: string }
  | { status: "failed"; message: string };

type PreviewJobResponse =
  | {
      success: true;
      job: {
        status: "queued" | "processing" | "completed" | "failed";
        error: string | null;
        previewUrls: { before: string; after: string } | null;
      };
    }
  | { success: false; error: { message: string } };

const POLL_INTERVAL_MS = 1000;

function sameSettings(a: AudioSettings, b: AudioSettings): boolean {
  return (
    a.loudnessTarget === b.loudnessTarget &&
    a.denoise === b.denoise &&
    a.levelSpeakers === b.levelSpeakers &&
    a.highpass === b.highpass
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded px-2 py-1 transition-colors ${
            option.value === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Podcast audio cleanup: loudness target, noise reduction, speaker leveling
 * and rumble removal, applied by ffmpeg at export. The browser can't run
 * those filters live, so "Preview 15s" renders a short before/after sample
 * from the playhead instead.
 */
export function AudioPanel() {
  const projectId = useProjectStore((s) => s.id);
  const settings = useProjectStore((s) => s.audioSettings);
  const setSettings = useProjectStore((s) => s.setAudioSettings);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const update = (patch: Partial<AudioSettings>) => {
    setSettings({ ...settings, ...patch });
    // A preview of the old settings would now be misleading.
    setPreview({ status: "idle" });
  };

  const pollPreview = (jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render/${jobId}`);
        const data: PreviewJobResponse = await res.json();
        if (!data.success) {
          setPreview({ status: "failed", message: data.error.message });
          return;
        }
        if (data.job.status === "completed" && data.job.previewUrls) {
          setPreview({ status: "ready", ...data.job.previewUrls });
        } else if (data.job.status === "failed") {
          setPreview({ status: "failed", message: data.job.error ?? "Preview failed." });
        } else {
          pollPreview(jobId);
        }
      } catch {
        pollPreview(jobId); // transient network hiccup -- keep polling
      }
    }, POLL_INTERVAL_MS);
  };

  const startPreview = async () => {
    if (!projectId) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    setPreview({ status: "rendering" });
    try {
      const res = await fetch(`/api/projects/${projectId}/render/audio-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: currentTime, audioSettings: settings }),
      });
      const data: { success: true; jobId: string } | { success: false; error: { message: string } } =
        await res.json();
      if (!data.success) {
        setPreview({ status: "failed", message: data.error.message });
        return;
      }
      pollPreview(data.jobId);
    } catch {
      setPreview({ status: "failed", message: "Could not start the preview. Try again." });
    }
  };

  const isPreset = sameSettings(settings, PODCAST_AUDIO_PRESET);
  const isOff = sameSettings(settings, DEFAULT_AUDIO_SETTINGS);
  const loudnessHint = LOUDNESS_OPTIONS.find((o) => o.value === settings.loudnessTarget)?.hint;

  return (
    <div className="flex flex-col gap-4 text-xs">
      <Button
        variant={isPreset ? "secondary" : "default"}
        size="sm"
        onClick={() => update(PODCAST_AUDIO_PRESET)}
        disabled={isPreset}
      >
        <Sparkles className="size-3.5" />
        {isPreset ? "Podcast-ready preset applied" : "Make podcast-ready"}
      </Button>

      <div className="flex flex-col gap-1.5">
        Loudness
        <Segmented
          options={LOUDNESS_OPTIONS}
          value={settings.loudnessTarget}
          onChange={(loudnessTarget) => update({ loudnessTarget })}
        />
        <span className="text-muted-foreground">{loudnessHint}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        Noise reduction
        <Segmented options={DENOISE_OPTIONS} value={settings.denoise} onChange={(denoise) => update({ denoise })} />
      </div>

      <label className="flex items-start gap-1.5">
        <input
          type="checkbox"
          checked={settings.levelSpeakers}
          onChange={(e) => update({ levelSpeakers: e.target.checked })}
          className="mt-0.5 accent-primary"
        />
        <span>
          Level speakers
          <span className="block text-muted-foreground">Evens out quiet and loud voices</span>
        </span>
      </label>

      <label className="flex items-start gap-1.5">
        <input
          type="checkbox"
          checked={settings.highpass}
          onChange={(e) => update({ highpass: e.target.checked })}
          className="mt-0.5 accent-primary"
        />
        <span>
          Remove rumble
          <span className="block text-muted-foreground">Cuts desk thumps, traffic and AC hum below 80Hz</span>
        </span>
      </label>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-muted-foreground">Applied when you export. Hear it first:</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={startPreview}
          disabled={isOff || preview.status === "rendering"}
        >
          {preview.status === "rendering" ? "Rendering preview…" : "Preview 15s from playhead"}
        </Button>
        {isOff && <span className="text-muted-foreground">Turn on a setting above to preview it.</span>}
        {preview.status === "failed" && <span className="text-destructive">{preview.message}</span>}
        {preview.status === "ready" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Before</span>
              <audio controls src={preview.before} className="h-8 w-full" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">After</span>
              <audio controls src={preview.after} className="h-8 w-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
