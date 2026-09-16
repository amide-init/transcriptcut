"use client";

import { useState } from "react";
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
        className="h-7 w-64 text-[0.95rem] font-medium"
      />
    );
  }

  return (
    <h1
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="Click to rename"
      className="-mx-1 cursor-text rounded px-1 text-[0.95rem] font-medium hover:bg-muted"
    >
      {name}
    </h1>
  );
}
