"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Play, Sparkles, X } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { usePlayerStore } from "@/stores/player-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useClipStore } from "@/stores/clip-store";
import { Button } from "@/components/ui/button";
import { CLIP_ASPECTS, CLIP_MAX_SECONDS, CLIP_MIN_SECONDS, type Clip } from "@/types/clips";

type ClipsResponse = { success: true; clips: Clip[] } | { success: false; error: { message: string } };
type RenderState =
  | { status: "rendering"; jobId: string }
  | { status: "done"; downloadUrl: string }
  | { status: "failed"; message: string };

const POLL_INTERVAL_MS = 2000;

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}

function ClipCard({
  clip,
  focused,
  render,
  onFocus,
  onChange,
  onDelete,
  onRender,
}: {
  clip: Clip;
  focused: boolean;
  render: RenderState | undefined;
  onFocus: () => void;
  onChange: (patch: Partial<Pick<Clip, "name" | "aspect" | "cropX" | "captions">>) => void;
  onDelete: () => void;
  onRender: () => void;
}) {
  const [cropX, setCropX] = useState(clip.cropX);
  const setFocused = useClipStore((s) => s.setFocused);

  return (
    <div
      onClick={onFocus}
      className={`flex flex-col gap-2 rounded-lg border p-2.5 transition-colors ${
        focused ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <input
          defaultValue={clip.name}
          maxLength={80}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== clip.name) onChange({ name });
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-border focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 text-muted-foreground hover:text-destructive"
          title="Delete clip"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-1 text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatTime(clip.sourceStart)}–{formatTime(clip.sourceEnd)}
        </span>
        <span>{Math.round(clip.sourceEnd - clip.sourceStart)}s</span>
        {clip.source === "ai" && <span className="rounded bg-primary/15 px-1 text-primary">AI pick</span>}
      </div>
      {clip.reason && <p className="px-1 leading-relaxed text-muted-foreground">{clip.reason}</p>}

      {focused && (
        <div className="flex flex-col gap-2 px-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1 rounded-md bg-muted p-0.5">
            {CLIP_ASPECTS.map((aspect) => (
              <button
                key={aspect}
                type="button"
                onClick={() => {
                  onChange({ aspect });
                  setFocused({ id: clip.id, aspect, cropX });
                }}
                className={`flex-1 rounded px-2 py-1 transition-colors ${
                  aspect === clip.aspect ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {aspect}
              </button>
            ))}
          </div>
          {clip.aspect !== "16:9" && (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Crop position (outlined on the video)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={cropX}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setCropX(value);
                  setFocused({ id: clip.id, aspect: clip.aspect, cropX: value });
                }}
                onPointerUp={() => onChange({ cropX })}
                onKeyUp={() => onChange({ cropX })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              />
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={clip.captions}
              onChange={(e) => onChange({ captions: e.target.checked })}
              className="accent-primary"
            />
            Burn in captions (Shorts style)
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRender} disabled={render?.status === "rendering"}>
              {render?.status === "rendering" ? "Rendering…" : render?.status === "done" ? "Re-render" : "Render clip"}
            </Button>
            {render?.status === "done" && (
              <Button asChild size="sm" variant="secondary">
                <a href={render.downloadUrl} download>
                  <Download className="size-3.5" />
                  Download
                </a>
              </Button>
            )}
          </div>
          {render?.status === "failed" && <span className="text-destructive">{render.message}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Clips / Shorts: AI-picked highlights (GPT-5.6 Luna, server side) or clips
 * made from a transcript selection, each rendered reframed with Shorts-style
 * captions. The project's cuts still apply inside a clip.
 */
export function ClipsPanel() {
  const projectId = useProjectStore((s) => s.id);
  const seek = usePlayerStore((s) => s.seek);
  const videoElement = usePlayerStore((s) => s.videoElement);
  const transcript = useTranscriptStore((s) => s.transcript);
  const selectedWordIds = useTranscriptStore((s) => s.selectedWordIds);
  const clearSelection = useTranscriptStore((s) => s.clearSelection);
  const focused = useClipStore((s) => s.focused);
  const setFocused = useClipStore((s) => s.setFocused);

  const [clips, setClips] = useState<Clip[]>([]);
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renders, setRenders] = useState<Record<string, RenderState>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      setFocused(null);
    };
  }, [setFocused]);

  const call = useCallback(
    async (path: string, method: string, body?: unknown) => {
      if (!projectId) return null;
      try {
        const res = await fetch(`/api/projects/${projectId}/clips${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data: ClipsResponse & { found?: number } = await res.json();
        if (data.success) {
          setClips(data.clips);
          setError(null);
        } else {
          setError(data.error.message);
        }
        return data;
      } catch {
        setError("Could not reach the server. Try again.");
        return null;
      }
    },
    [projectId]
  );

  useEffect(() => {
    void call("", "GET");
  }, [call]);

  const findHighlights = async () => {
    setFinding(true);
    setMessage(null);
    const data = await call("/highlights", "POST");
    if (data?.success) {
      setMessage(data.found ? `Found ${data.found} clip${data.found === 1 ? "" : "s"}.` : "No strong standalone moments found.");
    }
    setFinding(false);
  };

  const selectedWords = (transcript?.segments.flatMap((s) => s.words) ?? []).filter((w) =>
    selectedWordIds.includes(w.id)
  );
  const selectionStart = selectedWords.length ? Math.min(...selectedWords.map((w) => w.start)) : 0;
  const selectionEnd = selectedWords.length ? Math.max(...selectedWords.map((w) => w.end)) : 0;
  const selectionLength = selectionEnd - selectionStart;
  const selectionValid = selectedWords.length > 0 && selectionLength >= CLIP_MIN_SECONDS && selectionLength <= CLIP_MAX_SECONDS;

  const clipFromSelection = async () => {
    const data = await call("", "POST", { sourceStart: Math.max(0, selectionStart - 0.1), sourceEnd: selectionEnd + 0.3 });
    if (data?.success) clearSelection();
  };

  const focus = (clip: Clip) => {
    setFocused({ id: clip.id, aspect: clip.aspect, cropX: clip.cropX });
    seek(clip.sourceStart);
  };

  const pollRender = (clipId: string, jobId: string) => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render/${jobId}`);
        const data:
          | { success: true; job: { status: string; error: string | null; downloadUrl: string | null } }
          | { success: false; error: { message: string } } = await res.json();
        if (!data.success) {
          setRenders((r) => ({ ...r, [clipId]: { status: "failed", message: data.error.message } }));
        } else if (data.job.status === "completed" && data.job.downloadUrl) {
          setRenders((r) => ({ ...r, [clipId]: { status: "done", downloadUrl: data.job.downloadUrl! } }));
        } else if (data.job.status === "failed") {
          setRenders((r) => ({ ...r, [clipId]: { status: "failed", message: data.job.error ?? "Render failed." } }));
        } else {
          pollRender(clipId, jobId);
        }
      } catch {
        pollRender(clipId, jobId);
      }
    }, POLL_INTERVAL_MS);
    timers.current.push(timer);
  };

  const renderClip = async (clip: Clip) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId: clip.id }),
      });
      const data: { success: true; jobId: string } | { success: false; error: { message: string } } =
        await res.json();
      if (!data.success) {
        setRenders((r) => ({ ...r, [clip.id]: { status: "failed", message: data.error.message } }));
        return;
      }
      setRenders((r) => ({ ...r, [clip.id]: { status: "rendering", jobId: data.jobId } }));
      pollRender(clip.id, data.jobId);
    } catch {
      setRenders((r) => ({ ...r, [clip.id]: { status: "failed", message: "Could not start the render." } }));
    }
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <Button size="sm" onClick={findHighlights} disabled={finding}>
        <Sparkles className="size-3.5" />
        {finding ? "Finding the best moments…" : clips.some((c) => c.source === "ai") ? "Find highlights again" : "Find highlights"}
      </Button>
      <Button variant="secondary" size="sm" onClick={clipFromSelection} disabled={!selectionValid}>
        Clip from transcript selection
      </Button>
      <span className="text-muted-foreground">
        {selectedWords.length === 0
          ? "Or select words in the transcript (shift-click for a range) to make your own clip."
          : selectionValid
            ? `Selection: ${Math.round(selectionLength)}s`
            : `Selection is ${Math.round(selectionLength)}s -- clips need ${CLIP_MIN_SECONDS}s to ${CLIP_MAX_SECONDS / 60} min.`}
      </span>
      {message && <span className="text-muted-foreground">{message}</span>}
      {error && <span className="text-destructive">{error}</span>}

      {clips.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {clips.map((clip) => (
            <ClipCard
              key={`${clip.id}-${clip.name}`}
              clip={clip}
              focused={focused?.id === clip.id}
              render={renders[clip.id]}
              onFocus={() => {
                if (focused?.id !== clip.id) focus(clip);
              }}
              onChange={(patch) => void call(`/${clip.id}`, "PATCH", patch)}
              onDelete={() => {
                if (focused?.id === clip.id) setFocused(null);
                void call(`/${clip.id}`, "DELETE");
              }}
              onRender={() => void renderClip(clip)}
            />
          ))}
        </div>
      )}

      {focused && (
        <button
          type="button"
          onClick={() => {
            const clip = clips.find((c) => c.id === focused.id);
            if (!clip) return;
            seek(clip.sourceStart);
            void videoElement?.play();
          }}
          className="inline-flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
        >
          <Play className="size-3.5" />
          Play from clip start
        </button>
      )}
    </div>
  );
}
