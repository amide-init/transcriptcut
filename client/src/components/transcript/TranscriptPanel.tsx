"use client";

import { useMemo } from "react";
import { RotateCcw, X } from "lucide-react";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { SpeakerLabel } from "@/components/transcript/SpeakerLabel";
import { splitIntoSentences } from "@/lib/timeline/sentences";
import { cutsOverlapping, isWordCut, isFullyCut, padCutStart, wordSpanBounds } from "@/lib/timeline/cuts";
import type { CutOperation } from "@/types/edit-operation";
import type { TranscriptSegment } from "@/types/transcript";

export function TranscriptPanel() {
  const transcript = useTranscriptStore((s) => s.transcript);
  const selectedWordIds = useTranscriptStore((s) => s.selectedWordIds);
  const toggleWordSelection = useTranscriptStore((s) => s.toggleWordSelection);
  const selectWordRange = useTranscriptStore((s) => s.selectWordRange);
  const clearSelection = useTranscriptStore((s) => s.clearSelection);
  const fillerWordIds = useTranscriptStore((s) => s.fillerWordIds);
  const setSegmentSpeaker = useTranscriptStore((s) => s.setSegmentSpeaker);

  const projectId = useProjectStore((s) => s.id);

  const operations = useTimelineStore((s) => s.operations);
  const addCut = useTimelineStore((s) => s.addCut);
  const removeOperations = useTimelineStore((s) => s.removeOperations);
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
  const existingSpeakers = useMemo(
    () => Array.from(new Set(transcript?.segments.map((s) => s.speaker).filter((s): s is string => !!s))),
    [transcript]
  );

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
    addCut(padCutStart(start, allWords), end, "transcript edit");
    clearSelection();
  };

  const handleDeleteSentence = (start: number, end: number) => {
    addCut(padCutStart(start, allWords), end, "sentence");
  };

  const handleDeleteSegment = (segment: TranscriptSegment) => {
    // Use the segment's own words for the cut boundary, not the raw
    // Whisper segment.start/end -- see wordSpanBounds' doc comment for why.
    const { start, end } = wordSpanBounds(segment.words, { start: segment.start, end: segment.end });
    addCut(padCutStart(start, allWords), end, "segment");
  };

  /**
   * Restores whatever cut(s) overlap [start, end) -- a specific word,
   * sentence, or segment -- instead of only being able to undo the single
   * most recent edit. If those words were cut as part of a bigger
   * operation (e.g. a whole segment delete), this restores that whole
   * operation: a CutOperation is one [start, end) range, not a set of
   * individual words, so there's no way to hand back only part of it.
   */
  const handleRestore = (start: number, end: number) => {
    const overlapping = cutsOverlapping(start, end, cuts);
    if (overlapping.length === 0) return;
    removeOperations(overlapping.map((c) => c.id));
  };

  const handleSpeakerChange = (segmentId: string, speaker: string | null) => {
    setSegmentSpeaker(segmentId, speaker);
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId, speaker }),
    }).catch((err) => console.error("Failed to persist speaker:", err));
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
        </div>
      </div>
      <datalist id="speaker-suggestions">
        {existingSpeakers.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1 text-[1.0625rem] leading-[1.7]">
        {transcript.segments.map((segment, i) => {
          const previousSpeaker = transcript.segments[i - 1]?.speaker;
          // Unset is never "the same speaker" as another unset segment --
          // only dedupe the label when both are the same real, assigned name.
          const showSpeakerLabel = !segment.speaker || segment.speaker !== previousSpeaker;
          const segmentFullyCut = isFullyCut(segment.words, cuts);
          const sentences = splitIntoSentences(segment);
          return (
            <div key={segment.id} className="group/segment">
              <div className="mb-1 flex h-5 items-center justify-between">
                {showSpeakerLabel ? (
                  <SpeakerLabel
                    speaker={segment.speaker}
                    onChange={(speaker) => handleSpeakerChange(segment.id, speaker)}
                  />
                ) : (
                  <span />
                )}
                {segmentFullyCut ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="opacity-0 group-hover/segment:opacity-100"
                    onClick={() => {
                      const { start, end } = wordSpanBounds(segment.words, {
                        start: segment.start,
                        end: segment.end,
                      });
                      handleRestore(start, end);
                    }}
                  >
                    Restore segment
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive opacity-0 hover:text-destructive group-hover/segment:opacity-100"
                    onClick={() => handleDeleteSegment(segment)}
                  >
                    Delete segment
                  </Button>
                )}
              </div>
              <p>
                {sentences.map((sentence) => {
                  const sentenceFullyCut = isFullyCut(sentence.words, cuts);
                  return (
                    <span
                      key={sentence.words[0].id}
                      className="group/sentence rounded hover:bg-muted/40"
                    >
                      {sentence.words.map((word) => {
                        const cut = isWordCut(word.start, word.end, cuts);
                        const selected = selectedWordIds.includes(word.id);
                        const active = currentTime >= word.start && currentTime < word.end;
                        const filler = fillerWordIdSet.has(word.id);
                        return (
                          <span
                            key={word.id}
                            onClick={(e) => {
                              if (cut) {
                                handleRestore(word.start, word.end);
                                return;
                              }
                              seek(word.start);
                              handleWordClick(word.id, e);
                            }}
                            title={cut ? "Click to restore" : undefined}
                            className={[
                              "cursor-pointer rounded px-0.5 transition-colors",
                              cut
                                ? "text-muted-foreground/50 line-through decoration-destructive/70 hover:bg-muted/60"
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
                      {sentenceFullyCut ? (
                        <button
                          onClick={() => handleRestore(sentence.start, sentence.end)}
                          className="hidden size-4 -translate-y-px items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover/sentence:inline-flex"
                          title="Restore sentence"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteSentence(sentence.start, sentence.end)}
                          className="hidden size-4 -translate-y-px items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover/sentence:inline-flex"
                          title="Delete sentence"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
