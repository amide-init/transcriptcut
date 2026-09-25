"use client";

import { useMemo } from "react";
import { Merge, Play, RotateCcw, Scissors, Trash2 } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useScenes } from "@/lib/timeline/useScenes";
import { sceneAt, sceneColor, type Scene } from "@/lib/timeline/scenes";
import { cutsOverlapping } from "@/lib/timeline/cuts";
import { formatTimecode } from "@/lib/timeline/format";
import { Button } from "@/components/ui/button";
import type { CutOperation } from "@/types/edit-operation";

/**
 * Lists the episode's scenes -- stretches between split points -- so you
 * can name them, jump to them, drop a whole scene, or merge it back into
 * the one before. Everything here is ordinary edit operations (splits and
 * cuts), so it all goes through undo/redo.
 */
export function ScenesPanel() {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const operations = useTimelineStore((s) => s.operations);
  const addSplit = useTimelineStore((s) => s.addSplit);
  const addCut = useTimelineStore((s) => s.addCut);
  const replaceOperation = useTimelineStore((s) => s.replaceOperation);
  const removeOperations = useTimelineStore((s) => s.removeOperations);
  const { scenes, splitAt } = useScenes();

  const cuts = useMemo(() => operations.filter((op): op is CutOperation => op.type === "cut"), [operations]);
  const activeScene = sceneAt(scenes, currentTime);

  const rename = (scene: Scene, title: string) => {
    const split = operations.find((op) => op.id === scene.splitId);
    if (split?.type === "split") {
      replaceOperation(split.id, { ...split, id: crypto.randomUUID(), title, createdAt: Date.now() });
    } else if (scene.index === 0) {
      addSplit(0, title);
    }
  };

  const restore = (scene: Scene) => removeOperations(cutsOverlapping(scene.start, scene.end, cuts).map((c) => c.id));

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-1.5">
        <Button size="sm" onClick={() => splitAt(currentTime)}>
          <Scissors className="size-3.5" />
          Split scene at playhead
        </Button>
        <p className="text-muted-foreground">
          Or press <kbd className="rounded border border-border px-1 font-mono">S</kbd>. Splits land between words, never
          inside one.
        </p>
      </div>

      {scenes.length <= 1 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">
          The whole episode is one scene. Split it at each topic change to name sections and drop whole segments at
          once.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {scenes.map((scene) => {
            const kept = scene.editedEnd - scene.editedStart;
            const fullyCut = kept <= 0;
            const partlyCut = !fullyCut && kept < scene.end - scene.start - 0.05;
            const active = activeScene?.id === scene.id;
            return (
              <li
                key={scene.id}
                className={`group flex flex-col gap-1 rounded-lg border p-2 transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border"
                } ${fullyCut ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`size-2 shrink-0 rounded-full ${sceneColor(scene.index).dot}`} />
                  <input
                    key={scene.title}
                    defaultValue={scene.title}
                    maxLength={80}
                    aria-label="Scene name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.value = scene.title;
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const title = e.target.value.trim();
                      if (title && title !== scene.title) rename(scene, title);
                      else e.target.value = scene.title;
                    }}
                    className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-border focus:border-primary focus:outline-none ${
                      fullyCut ? "line-through" : ""
                    }`}
                  />
                  <Button variant="ghost" size="icon-xs" onClick={() => seek(scene.start)} title="Jump to scene">
                    <Play className="size-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 pl-3.5 text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {formatTimecode(scene.start)} · {formatTimecode(kept)}
                    {partlyCut && <span className="text-destructive/80"> (trimmed)</span>}
                  </span>
                  <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {scene.index > 0 && scene.splitId && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeOperations([scene.splitId!])}
                        title="Merge into previous scene"
                      >
                        <Merge className="size-3" />
                      </Button>
                    )}
                    {fullyCut || partlyCut ? (
                      <Button variant="ghost" size="icon-xs" onClick={() => restore(scene)} title="Restore scene">
                        <RotateCcw className="size-3" />
                      </Button>
                    ) : null}
                    {!fullyCut && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="hover:text-destructive"
                        onClick={() => addCut(scene.start, scene.end, `scene: ${scene.title}`)}
                        title="Cut this whole scene"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
