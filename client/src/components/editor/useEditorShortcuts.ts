import { useEffect } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useScenes } from "@/lib/timeline/useScenes";
import { gapBefore } from "@/lib/timeline/scenes";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Editor-wide keys: S splits a scene at the playhead, / splits right
 * before the transcript's cursor word (or at the playhead with no cursor),
 * Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes.
 */
export function useEditorShortcuts() {
  const undo = useTimelineStore((s) => s.undo);
  const redo = useTimelineStore((s) => s.redo);
  const { splitAt } = useScenes();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        splitAt(usePlayerStore.getState().currentTime);
      } else if (!mod && !e.altKey && e.key === "/") {
        // No shiftKey check: on some layouts "/" is itself a shifted key.
        e.preventDefault();
        const { transcript, caretWordId, setCaret, clearSelection } = useTranscriptStore.getState();
        const words = transcript?.segments.flatMap((s) => s.words) ?? [];
        const word = words.find((w) => w.id === caretWordId);
        splitAt(word ? gapBefore(word.start, words) : usePlayerStore.getState().currentTime);
        setCaret(null);
        clearSelection();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, splitAt]);
}
