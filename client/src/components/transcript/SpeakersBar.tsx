"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Scissors, Users } from "lucide-react";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSpeakers, speakerColor } from "@/lib/transcript/speakers";
import { cutsOverlapping, isFullyCut, padCutStart, wordSpanBounds } from "@/lib/timeline/cuts";
import type { CutOperation } from "@/types/edit-operation";
import type { Transcript } from "@/types/transcript";

type Job = {
  status: "queued" | "processing" | "completed" | "failed";
  totalChunks: number;
  completedChunks: number;
  error: string | null;
};

const POLL_INTERVAL_MS = 2000;

function SpeakerChip({
  name,
  color,
  segmentCount,
  allCut,
  onRename,
  onCutAll,
  onRestoreAll,
}: {
  name: string;
  color: string;
  segmentCount: number;
  allCut: boolean;
  onRename: (to: string) => void;
  onCutAll: () => void;
  onRestoreAll: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => {
    setEditing(false);
    const to = draft.trim();
    if (to && to !== name) onRename(to);
  };

  return (
    <div className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-xs">
      <span className={`size-2 shrink-0 rounded-full ${color}`} />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="h-5 w-28 px-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          title="Rename everywhere"
          className={allCut ? "text-muted-foreground line-through" : "hover:text-primary"}
        >
          {name}
        </button>
      )}
      <span className="text-muted-foreground">{segmentCount}</span>
      {allCut ? (
        <button
          type="button"
          onClick={onRestoreAll}
          title={`Restore everything ${name} said`}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onCutAll}
          title={`Cut everything ${name} said`}
          className="rounded-full p-1 text-muted-foreground hover:text-destructive"
        >
          <Scissors className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Speaker tools above the transcript: detect speakers (background job, see
 * server lib/ai/diarization-job.ts), then rename a speaker everywhere, or
 * cut/restore everything they said. Cutting a speaker is ordinary cut
 * operations per segment, so render, captions and chapters all follow.
 */
export function SpeakersBar() {
  const projectId = useProjectStore((s) => s.id);
  const transcript = useTranscriptStore((s) => s.transcript);
  const setTranscript = useTranscriptStore((s) => s.setTranscript);
  const operations = useTimelineStore((s) => s.operations);
  const addCut = useTimelineStore((s) => s.addCut);
  const removeOperations = useTimelineStore((s) => s.removeOperations);

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const cuts = useMemo(() => operations.filter((op): op is CutOperation => op.type === "cut"), [operations]);
  const speakers = useMemo(() => listSpeakers(transcript), [transcript]);
  const allWords = useMemo(() => transcript?.segments.flatMap((s) => s.words) ?? [], [transcript]);

  if (!transcript || !projectId) return null;

  const refreshTranscript = async () => {
    const res = await fetch(`/api/projects/${projectId}/transcript`);
    const data: { success: true; transcript: Transcript } | { success: false } = await res.json();
    if (data.success) setTranscript(data.transcript);
  };

  const poll = (jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/speakers/detect/${jobId}`);
        const data: { success: true; job: Job } | { success: false; error: { message: string } } = await res.json();
        if (!data.success) {
          setError(data.error.message);
          setJob(null);
          return;
        }
        setJob(data.job);
        if (data.job.status === "completed") {
          await refreshTranscript();
          setJob(null);
        } else if (data.job.status === "failed") {
          setError("Speakers couldn't be detected. Please try again.");
          setJob(null);
        } else {
          poll(jobId);
        }
      } catch {
        poll(jobId);
      }
    }, POLL_INTERVAL_MS);
  };

  const detect = async () => {
    setError(null);
    setJob({ status: "queued", totalChunks: 0, completedChunks: 0, error: null });
    try {
      const res = await fetch(`/api/projects/${projectId}/speakers/detect`, { method: "POST" });
      const data: { success: true; jobId: string } | { success: false; error: { message: string } } =
        await res.json();
      if (!data.success) {
        setError(data.error.message);
        setJob(null);
        return;
      }
      poll(data.jobId);
    } catch {
      setError("Could not start speaker detection. Try again.");
      setJob(null);
    }
  };

  const rename = async (from: string, to: string) => {
    const res = await fetch(`/api/projects/${projectId}/speakers/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const data: { success: true; transcript: Transcript } | { success: false; error: { message: string } } =
      await res.json();
    if (data.success) setTranscript(data.transcript);
    else setError(data.error.message);
  };

  const segmentsOf = (name: string) => transcript.segments.filter((s) => s.speaker === name && s.words.length > 0);

  const cutAll = (name: string) => {
    for (const segment of segmentsOf(name)) {
      if (isFullyCut(segment.words, cuts)) continue;
      const { start, end } = wordSpanBounds(segment.words, { start: segment.start, end: segment.end });
      addCut(padCutStart(start, allWords), end, `speaker: ${name}`);
    }
  };

  const restoreAll = (name: string) => {
    const ids = new Set<string>();
    for (const segment of segmentsOf(name)) {
      const { start, end } = wordSpanBounds(segment.words, { start: segment.start, end: segment.end });
      for (const cut of cutsOverlapping(start, end, cuts)) ids.add(cut.id);
    }
    removeOperations([...ids]);
  };

  const running = job !== null;
  const progress =
    job && job.totalChunks > 1 ? ` ${job.completedChunks}/${job.totalChunks}` : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {speakers.map((name) => {
        const segments = segmentsOf(name);
        return (
          <SpeakerChip
            key={name}
            name={name}
            color={speakerColor(name, speakers)}
            segmentCount={segments.length}
            allCut={segments.length > 0 && segments.every((s) => isFullyCut(s.words, cuts))}
            onRename={(to) => void rename(name, to)}
            onCutAll={() => cutAll(name)}
            onRestoreAll={() => restoreAll(name)}
          />
        );
      })}
      <Button
        variant="ghost"
        size="xs"
        onClick={detect}
        disabled={running}
        title={speakers.length > 0 ? "Re-detect speakers (replaces current labels)" : "Label who is speaking"}
      >
        <Users className="size-3.5" />
        {running ? `Detecting speakers…${progress}` : speakers.length > 0 ? "Re-detect" : "Detect speakers"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
