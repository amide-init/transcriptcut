"use client";

import { useEffect, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CARD_BACKGROUNDS } from "@/lib/cards/layout";
import {
  CARD_MAX_SECONDS,
  CARD_MIN_SECONDS,
  CARD_SUBTITLE_MAX,
  CARD_TEMPLATES,
  CARD_TITLE_MAX,
  type CardOperation,
  type CardTemplate,
} from "@/types/edit-operation";

const TEMPLATE_LABELS: Record<CardTemplate, string> = {
  title: "Title",
  chapter: "Chapter",
  quote: "Quote",
  outro: "Outro",
};

const SUBTITLE_PLACEHOLDER: Record<CardTemplate, string> = {
  title: "Subtitle (optional)",
  chapter: "Label above, e.g. Part 2",
  quote: "Who said it (optional)",
  outro: "e.g. Subscribe for more",
};

/** Card text goes into an ASS file at export: no override-tag characters or line breaks (the API refuses them too). */
function cleanCardText(text: string): string {
  return Array.from(text)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && !"{}\\".includes(ch);
    })
    .join("");
}

/**
 * Edits one title card. Changes stay in a local draft, previewed live over
 * the player (player store's cardDraft), and are saved as a single
 * operation replacement -- one undo step -- when the editor is closed.
 */
export function CardEditor({
  card,
  onSave,
  onDelete,
  onClose,
}: {
  card: CardOperation;
  onSave: (next: CardOperation) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(card);
  const setCardDraft = usePlayerStore((s) => s.setCardDraft);

  useEffect(() => {
    setCardDraft(draft);
  }, [draft, setCardDraft]);
  useEffect(() => () => setCardDraft(null), [setCardDraft]);

  const update = (patch: Partial<CardOperation>) => setDraft((d) => ({ ...d, ...patch }));
  const title = draft.title.trim();
  const changed = JSON.stringify(draft) !== JSON.stringify(card);

  const done = () => {
    if (changed && title) {
      const subtitle = draft.subtitle?.trim();
      onSave({ ...draft, title, subtitle: subtitle || undefined });
    }
    onClose();
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/40 p-2.5">
      <div className="grid grid-cols-4 gap-1">
        {CARD_TEMPLATES.map((template) => (
          <button
            key={template}
            type="button"
            onClick={() => update({ template })}
            className={`rounded border px-1 py-1 text-[0.7rem] ${
              draft.template === template
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {TEMPLATE_LABELS[template]}
          </button>
        ))}
      </div>
      <Input
        autoFocus
        value={draft.title}
        maxLength={CARD_TITLE_MAX}
        placeholder="Title"
        aria-label="Card title"
        onChange={(e) => update({ title: cleanCardText(e.target.value) })}
        onKeyDown={(e) => e.key === "Enter" && done()}
        className="h-8 text-xs"
      />
      <Input
        value={draft.subtitle ?? ""}
        maxLength={CARD_SUBTITLE_MAX}
        placeholder={SUBTITLE_PLACEHOLDER[draft.template]}
        aria-label="Card subtitle"
        onChange={(e) => update({ subtitle: cleanCardText(e.target.value) })}
        onKeyDown={(e) => e.key === "Enter" && done()}
        className="h-8 text-xs"
      />
      <label className="flex items-center gap-2 text-muted-foreground">
        <span className="w-14 shrink-0">Duration</span>
        <input
          type="range"
          min={CARD_MIN_SECONDS}
          max={CARD_MAX_SECONDS}
          step={0.5}
          value={draft.duration}
          onChange={(e) => update({ duration: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-primary"
        />
        <span className="w-8 text-right font-mono tabular-nums">{draft.duration}s</span>
      </label>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-muted-foreground">Color</span>
        {CARD_BACKGROUNDS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => update({ background: color })}
            title={color}
            className={`size-5 rounded-full border ${
              draft.background.toUpperCase() === color ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "border-border"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <input
          type="color"
          value={draft.background}
          onChange={(e) => update({ background: e.target.value.toUpperCase() })}
          aria-label="Custom card color"
          className="size-5 cursor-pointer rounded-full border border-border bg-transparent p-0"
        />
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={onDelete}>
          Delete card
        </Button>
        <Button size="xs" onClick={done} disabled={!title}>
          Done
        </Button>
      </div>
    </div>
  );
}
