"use client";

import { useMemo } from "react";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import type { CutOperation } from "@/types/edit-operation";

function isWordCut(start: number, end: number, cuts: CutOperation[]): boolean {
  return cuts.some((c) => start >= c.start && end <= c.end + 0.001);
}

export function TranscriptPanel() {
  const transcript = useTranscriptStore((s) => s.transcript);
  const selectedWordIds = useTranscriptStore((s) => s.selectedWordIds);
  const toggleWordSelection = useTranscriptStore((s) => s.toggleWordSelection);
  const selectWordRange = useTranscriptStore((s) => s.selectWordRange);
  const clearSelection = useTranscriptStore((s) => s.clearSelection);
  const fillerWordIds = useTranscriptStore((s) => s.fillerWordIds);
  const detectingFillerWords = useTranscriptStore((s) => s.detectingFillerWords);
  const setFillerWordIds = useTranscriptStore((s) => s.setFillerWordIds);
  const setDetectingFillerWords = useTranscriptStore((s) => s.setDetectingFillerWords);

  const projectId = useProjectStore((s) => s.id);

  const operations = useTimelineStore((s) => s.operations);
  const addCut = useTimelineStore((s) => s.addCut);
  const cuts = useMemo(
    () => operations.filter((op): op is CutOperation => op.type === "cut"),
    [operations]
  );

  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  const allWords = useMemo(
    () => transcript?.segments.flatMap((seg) => seg.words) ?? [],
    [transcript]
  );
  const fillerWordIdSet = useMemo(() => new Set(fillerWordIds), [fillerWordIds]);

  if (!transcript) return null;

  const handleWordClick = (wordId: string, e: React.MouseEvent) => {
    if (e.shiftKey && selectedWordIds.length > 0) {
      selectWordRange(selectedWordIds[0], wordId);
    } else {
      toggleWordSelection(wordId);
    }
  };

  const handleDeleteSelected = () => {
    const selected = allWords.filter((w) => selectedWordIds.includes(w.id));
    if (selected.length === 0) return;
    const start = Math.min(...selected.map((w) => w.start));
    const end = Math.max(...selected.map((w) => w.end));
    addCut(start, end, "transcript edit");
    clearSelection();
  };

  const handleFindFillerWords = async () => {
    if (!projectId) return;
    setDetectingFillerWords(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/filler-words`, { method: "POST" });
      const data: { success: true; fillerWordIds: string[] } | { success: false } = await res.json();
      setFillerWordIds(data.success ? data.fillerWordIds : []);
    } catch (err) {
      console.error("Filler word detection failed:", err);
      setFillerWordIds([]);
    } finally {
      setDetectingFillerWords(false);
    }
  };

  const handleRemoveFillerWords = () => {
    for (const word of allWords) {
      if (fillerWordIdSet.has(word.id)) {
        addCut(word.start, word.end, "filler word");
      }
    }
    setFillerWordIds([]);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex h-7 items-center justify-between">
        <h2 className="text-[0.8rem] text-muted-foreground">Transcript</h2>
        <div className="flex items-center gap-2">
          {selectedWordIds.length > 0 && (
            <Button variant="destructive" size="xs" onClick={handleDeleteSelected}>
              Delete {selectedWordIds.length === 1 ? "word" : `${selectedWordIds.length} words`}
            </Button>
          )}
          {fillerWordIds.length > 0 ? (
            <>
              <Button variant="ghost" size="xs" onClick={() => setFillerWordIds([])}>
                Dismiss
              </Button>
              <Button variant="destructive" size="xs" onClick={handleRemoveFillerWords}>
                Remove {fillerWordIds.length === 1 ? "filler word" : `${fillerWordIds.length} filler words`}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={handleFindFillerWords}
              disabled={detectingFillerWords}
            >
              {detectingFillerWords ? "Scanning…" : "Find filler words"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1 text-[1.0625rem] leading-[1.7]">
        {transcript.segments.map((segment) => (
          <p key={segment.id}>
            {segment.words.map((word) => {
              const cut = isWordCut(word.start, word.end, cuts);
              const selected = selectedWordIds.includes(word.id);
              const active = currentTime >= word.start && currentTime < word.end;
              const filler = fillerWordIdSet.has(word.id);
              return (
                <span
                  key={word.id}
                  onClick={(e) => {
                    if (cut) return;
                    seek(word.start);
                    handleWordClick(word.id, e);
                  }}
                  className={[
                    "cursor-pointer rounded px-0.5 transition-colors",
                    cut
                      ? "text-muted-foreground/50 line-through decoration-destructive/70"
                      : "",
                    selected ? "bg-accent/30" : "",
                    active && !cut ? "bg-primary/25" : "",
                    filler && !cut
                      ? "underline decoration-dotted decoration-muted-foreground underline-offset-4"
                      : "",
                  ].join(" ")}
                >
                  {word.text}{" "}
                </span>
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
