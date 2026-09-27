"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenText, Clapperboard, Sparkles } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useSceneSuggestionStore } from "@/stores/scene-suggestion-store";
import { operationsForSuggestions, suggestionsFromChapters, type SceneSuggestion } from "@/lib/scenes/suggestions";
import { formatTimecode } from "@/lib/timeline/format";
import { Button } from "@/components/ui/button";
import type { ResolvedChapter } from "@/types/publishing";

type ApiError = { success: false; error: { message: string } };
type ShotJob = { id: string; status: "queued" | "processing" | "completed" | "failed"; shots: number[] | null; error: string | null };

const POLL_MS = 1500;

/**
 * Builds scenes for you, for review: AI suggestions (topic changes, landed
 * on shot changes when detected), or scenes from the episode's chapters.
 * Nothing changes until Apply, which adds the kept scenes -- and, if
 * chosen, a numbered title card for each -- as one undo step.
 */
export function SceneSuggestions() {
  const projectId = useProjectStore((s) => s.id);
  const seek = usePlayerStore((s) => s.seek);
  const operations = useTimelineStore((s) => s.operations);
  const applyChange = useTimelineStore((s) => s.applyChange);
  const transcript = useTranscriptStore((s) => s.transcript);
  const { suggestions, source, shots, setSuggestions, update, clear, setShots } = useSceneSuggestionStore();

  const [busy, setBusy] = useState<"suggest" | "chapters" | "shots" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withCards, setWithCards] = useState(true);
  const pollRef = useRef<number | null>(null);

  const pollShots = useCallback(
    (jobId: string) => {
      if (!projectId) return;
      setBusy("shots");
      const tick = async () => {
        const res = await fetch(`/api/projects/${projectId}/scenes/shots/${jobId}`);
        const data: { success: true; job: ShotJob } | ApiError = await res.json();
        if (!data.success) {
          setBusy(null);
          setError(data.error.message);
          return;
        }
        if (data.job.status === "completed") {
          setShots(data.job.shots ?? []);
          setBusy(null);
        } else if (data.job.status === "failed") {
          setError(data.job.error ?? "Shot detection failed.");
          setBusy(null);
        } else {
          pollRef.current = window.setTimeout(tick, POLL_MS);
        }
      };
      void tick();
    },
    [projectId, setShots]
  );

  // Pick up the last detection (or one still running) when the panel opens.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/scenes/shots`);
      const data: { success: true; job: ShotJob | null } | ApiError = await res.json();
      if (cancelled || !data.success || !data.job) return;
      if (data.job.status === "completed") setShots(data.job.shots ?? []);
      else if (data.job.status === "queued" || data.job.status === "processing") pollShots(data.job.id);
    })();
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    };
  }, [projectId, pollShots, setShots]);

  const detectShots = async () => {
    if (!projectId) return;
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/scenes/shots`, { method: "POST" });
    const data: { success: true; jobId: string } | ApiError = await res.json();
    if (data.success) pollShots(data.jobId);
    else setError(data.error.message);
  };

  const suggest = async () => {
    if (!projectId) return;
    setBusy("suggest");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/suggest`, { method: "POST" });
      const data: { success: true; suggestions: SceneSuggestion[] } | ApiError = await res.json();
      if (!data.success) setError(data.error.message);
      else if (data.suggestions.length === 0) setError("No clear topic changes were found.");
      else setSuggestions(data.suggestions, "ai");
    } finally {
      setBusy(null);
    }
  };

  const fromChapters = async () => {
    if (!projectId) return;
    setBusy("chapters");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publishing`);
      const data: { success: true; chapters: ResolvedChapter[] } | ApiError = await res.json();
      if (!data.success) setError(data.error.message);
      else if (data.chapters.length < 2) setError("Generate chapters in the Publish panel first.");
      else setSuggestions(suggestionsFromChapters(data.chapters, transcript?.segments.flatMap((s) => s.words) ?? []), "manual");
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    const kept = (suggestions ?? []).filter((s) => s.keep && s.title.trim());
    if (kept.length === 0) return;
    const { added, removedIds } = operationsForSuggestions(
      kept.map((s) => ({ ...s, title: s.title.trim() })),
      operations,
      { withCards, source }
    );
    applyChange(added, removedIds);
    clear();
  };

  const keptCount = suggestions?.filter((s) => s.keep).length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" onClick={() => void suggest()} disabled={busy !== null || !transcript}>
          <Sparkles className="size-3.5" />
          {busy === "suggest" ? "Thinking…" : "Suggest scenes"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void fromChapters()} disabled={busy !== null}>
          <BookOpenText className="size-3.5" />
          From chapters
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>
          {busy === "shots"
            ? "Finding shot changes…"
            : shots === null
              ? "Find camera cuts to line scenes up with them."
              : `${shots.length} shot change${shots.length === 1 ? "" : "s"} found${shots.length > 0 ? " -- suggestions snap to them" : ""}.`}
        </span>
        <Button variant="ghost" size="xs" onClick={() => void detectShots()} disabled={busy !== null}>
          <Clapperboard className="size-3" />
          {shots === null ? "Find" : "Again"}
        </Button>
      </div>
      {error && <p className="rounded-md bg-destructive/10 p-2 text-destructive">{error}</p>}

      {suggestions && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2">
          <span className="font-medium">
            {source === "ai" ? "Suggested scenes" : "Scenes from chapters"} -- review, then apply
          </span>
          <ol className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={s.keep}
                  onChange={(e) => update(s.key, { keep: e.target.checked })}
                  aria-label={`Keep ${s.title}`}
                  className="mt-1.5 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <input
                    value={s.title}
                    maxLength={60}
                    onChange={(e) => update(s.key, { title: e.target.value.replace(/[{}\\]/g, "") })}
                    aria-label="Scene name"
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => seek(s.at)}
                    className="flex w-full items-baseline gap-1.5 px-1 text-left text-muted-foreground hover:text-foreground"
                    title="Jump here"
                  >
                    <span className="font-mono tabular-nums">{formatTimecode(s.at)}</span>
                    {s.onShot && <span className="rounded bg-primary/15 px-1 text-primary">on a cut</span>}
                    {s.excerpt && <span className="truncate">{s.excerpt}</span>}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={withCards} onChange={(e) => setWithCards(e.target.checked)} className="accent-primary" />
            Add a numbered title card to each scene
          </label>
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="xs" onClick={clear}>
              Dismiss
            </Button>
            <Button size="xs" onClick={apply} disabled={keptCount === 0}>
              Apply {keptCount} scene{keptCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
