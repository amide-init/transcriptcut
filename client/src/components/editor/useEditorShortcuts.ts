import { useEffect } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useScenes } from "@/lib/timeline/useScenes";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Editor-wide keys: S splits a scene at the playhead, Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes. */
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
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, splitAt]);
}
