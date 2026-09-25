"use client";

import { useMemo, useState } from "react";
import { Merge, Play, RotateCcw, Scissors, Trash2, Type } from "lucide-react";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useScenes } from "@/lib/timeline/useScenes";
import { sceneAt, sceneColor, type Scene } from "@/lib/timeline/scenes";
import { cutsOverlapping } from "@/lib/timeline/cuts";
import { formatTimecode } from "@/lib/timeline/format";
import { Button } from "@/components/ui/button";
import { CardEditor } from "@/components/editor/CardEditor";
import { TransitionPicker } from "@/components/editor/TransitionPicker";
import { SceneSuggestions } from "@/components/editor/SceneSuggestions";
import { CARD_BACKGROUNDS } from "@/lib/cards/layout";
import type { CardOperation, CardTemplate, CutOperation, TransitionOperation } from "@/types/edit-operation";

/** A card at a scene's start (within this) belongs to that scene. */
const CARD_MATCH_SECONDS = 0.05;

/**
 * Lists the episode's scenes -- stretches between split points -- so you
 * can name them, jump to them, drop a whole scene, or merge it back into
 * the one before, and give it a title card. Everything here is ordinary
 * edit operations (splits, cuts, cards), so it all goes through undo/redo.
 */
export function ScenesPanel() {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const operations = useTimelineStore((s) => s.operations);
  const addSplit = useTimelineStore((s) => s.addSplit);
  const addCut = useTimelineStore((s) => s.addCut);
  const replaceOperation = useTimelineStore((s) => s.replaceOperation);
  const removeOperations = useTimelineStore((s) => s.removeOperations);
  const addOperations = useTimelineStore((s) => s.addOperations);
  const duration = usePlayerStore((s) => s.duration);
  const setCard = usePlayerStore((s) => s.setCard);
  const { scenes, splitAt } = useScenes();
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const cuts = useMemo(() => operations.filter((op): op is CutOperation => op.type === "cut"), [operations]);
  const cards = useMemo(
    () =>
      operations
        .filter((op): op is CardOperation => op.type === "card")
        .sort((a, b) => a.createdAt - b.createdAt),
    [operations]
  );
  const cardsAt = (at: number) => cards.filter((c) => Math.abs(c.at - at) <= CARD_MATCH_SECONDS);
  const transitions = useMemo(
    () =>
      operations
        .filter((op): op is TransitionOperation => op.type === "transition")
        .sort((a, b) => a.createdAt - b.createdAt),
    [operations]
  );
  /** The transition in effect at a moment: the latest one there. */
  const transitionAt = (at: number) => transitions.filter((t) => Math.abs(t.at - at) <= CARD_MATCH_SECONDS).at(-1);
  const outroCards = cards.filter((c) => c.at >= duration - CARD_MATCH_SECONDS);
  const activeScene = sceneAt(scenes, currentTime);

  const addCard = (at: number, template: CardTemplate, title: string) => {
    const card: CardOperation = {
      id: crypto.randomUUID(),
      type: "card",
      at,
      duration: 3,
      template,
      title,
      background: CARD_BACKGROUNDS[0],
      createdAt: Date.now(),
    };
    addOperations([card]);
    setCard(null);
    setEditingCardId(card.id);
  };

  const cardList = (list: CardOperation[]) =>
    list.map((card) =>
      editingCardId === card.id ? (
        <CardEditor
          key={card.id}
          card={card}
          onSave={(next) => replaceOperation(card.id, { ...next, id: crypto.randomUUID() })}
          onDelete={() => {
            removeOperations([card.id]);
            setEditingCardId(null);
          }}
          onClose={() => setEditingCardId(null)}
        />
      ) : (
        <button
          key={card.id}
          type="button"
          onClick={() => setEditingCardId(card.id)}
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted/60"
          title="Edit title card"
        >
          <span className="size-3.5 shrink-0 rounded-sm border border-border" style={{ backgroundColor: card.background }} />
          <span className="min-w-0 flex-1 truncate">{card.title}</span>
          <span className="font-mono text-muted-foreground tabular-nums">{card.duration}s</span>
        </button>
      )
    );

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

      <SceneSuggestions />

      {scenes.length <= 1 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">
          The whole episode is one scene. Split it at each topic change to name sections, drop whole segments at once,
          and open each one with a title card.
        </p>
      )}
      {scenes.length > 0 && (
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
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        addCard(scene.index === 0 ? 0 : scene.start, scene.index === 0 ? "title" : "chapter", scene.title)
                      }
                      title={scene.index === 0 ? "Add an intro card" : "Add a title card before this scene"}
                    >
                      <Type className="size-3" />
                    </Button>
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
                {cardsAt(scene.index === 0 ? 0 : scene.start).length > 0 && (
                  <div className="flex flex-col gap-1 pl-3.5">{cardList(cardsAt(scene.index === 0 ? 0 : scene.start))}</div>
                )}
                <div className="pl-3.5">
                  {scene.index === 0 ? (
                    <TransitionPicker label="Fade in" at={0} edge="in" current={transitionAt(0)} />
                  ) : (
                    <TransitionPicker
                      label="Transition in"
                      at={scene.start}
                      current={transitionAt(scene.start)}
                      canCrossfade={cardsAt(scene.start).length > 0}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {duration > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Outro</span>
            <Button variant="ghost" size="xs" onClick={() => addCard(duration, "outro", "Thanks for listening")}>
              <Type className="size-3" />
              Add outro card
            </Button>
          </div>
          {cardList(outroCards)}
          <TransitionPicker label="Fade out" at={duration} edge="out" current={transitionAt(duration)} />
        </div>
      )}
    </div>
  );
}
