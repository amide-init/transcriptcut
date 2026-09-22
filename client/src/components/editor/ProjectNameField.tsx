"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { Input } from "@/components/ui/input";

/** Click the project name in the navbar to rename it in place, like ProjectRow's rename field on the dashboard. */
export function ProjectNameField() {
  const name = useProjectStore((s) => s.name);
  const setName = useProjectStore((s) => s.setName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) {
      setDraft(name);
      return;
    }
    setName(trimmed);
  };

  if (editing) {
    return (
      <div className="flex h-8 items-center gap-1.5 rounded-lg border border-input pl-2.5">
        <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="h-full w-56 border-none px-0 text-[0.85rem] font-medium shadow-none focus-visible:ring-0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="Click to rename"
      className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.85rem] font-medium hover:bg-muted"
    >
      <Clapperboard className="size-3.5 text-muted-foreground" />
      {name}
    </button>
  );
}
