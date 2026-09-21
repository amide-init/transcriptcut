"use client";

import { useMemo } from "react";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { detectSilences } from "@/lib/timeline/silence";
import { padCutStart } from "@/lib/timeline/cuts";
import { Button } from "@/components/ui/button";

/** The two algorithmic (non-generative) editing aids: filler-word and long-pause detection. */
export function AiToolsPanel() {
  const transcript = useTranscriptStore((s) => s.transcript);
  const fillerWordIds = useTranscriptStore((s) => s.fillerWordIds);
  const detectingFillerWords = useTranscriptStore((s) => s.detectingFillerWords);
  const setFillerWordIds = useTranscriptStore((s) => s.setFillerWordIds);
  const setDetectingFillerWords = useTranscriptStore((s) => s.setDetectingFillerWords);
  const silenceGaps = useTranscriptStore((s) => s.silenceGaps);
  const setSilenceGaps = useTranscriptStore((s) => s.setSilenceGaps);

  const projectId = useProjectStore((s) => s.id);
  const addCut = useTimelineStore((s) => s.addCut);

  const allWords = useMemo(
    () => transcript?.segments.flatMap((seg) => seg.words) ?? [],
    [transcript]
  );

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
    const fillerWordIdSet = new Set(fillerWordIds);
    for (const word of allWords) {
      if (fillerWordIdSet.has(word.id)) {
        addCut(padCutStart(word.start, allWords), word.end, "filler word");
      }
    }
    setFillerWordIds([]);
  };

  const handleFindSilences = () => {
    if (!transcript) return;
    setSilenceGaps(detectSilences(transcript));
  };

  const handleRemoveSilences = () => {
    if (!silenceGaps) return;
    for (const gap of silenceGaps) {
      addCut(gap.start, gap.end, "long pause");
    }
    setSilenceGaps(null);
  };

  return (
    <div className="flex flex-col gap-5 text-xs">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground">Filler words</span>
        {fillerWordIds.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Button variant="destructive" size="xs" onClick={handleRemoveFillerWords}>
              Remove {fillerWordIds.length === 1 ? "1 filler word" : `${fillerWordIds.length} filler words`}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setFillerWordIds([])}>
              Dismiss
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={handleFindFillerWords}
            disabled={detectingFillerWords || !transcript}
          >
            {detectingFillerWords ? "Scanning…" : "Find filler words"}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground">Long pauses</span>
        {silenceGaps && silenceGaps.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Button variant="destructive" size="xs" onClick={handleRemoveSilences}>
              Remove {silenceGaps.length === 1 ? "1 pause" : `${silenceGaps.length} pauses`}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSilenceGaps(null)}>
              Dismiss
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="xs" onClick={handleFindSilences} disabled={!transcript}>
            {silenceGaps ? "No long pauses found" : "Find long pauses"}
          </Button>
        )}
      </div>
    </div>
  );
}
