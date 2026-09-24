"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Inline speaker assign/rename for one transcript segment, per claude.md section 10. */
export function SpeakerLabel({
  speaker,
  color,
  onChange,
}: {
  speaker?: string;
  /** Tailwind background class for the initial bubble (see lib/transcript/speakers.ts). */
  color?: string;
  onChange: (speaker: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(speaker ?? "");

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (speaker ?? "")) return;
    onChange(trimmed.length > 0 ? trimmed : null);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        list="speaker-suggestions"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(speaker ?? "");
            setEditing(false);
          }
        }}
        placeholder="Speaker name"
        className="h-6 w-40 text-xs"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(speaker ?? "");
        setEditing(true);
      }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      {speaker ? (
        <>
          <span
            className={`flex size-4 items-center justify-center rounded-full text-[0.6rem] font-medium ${
              color ? `${color} text-white` : "bg-secondary text-secondary-foreground"
            }`}
          >
            {initial(speaker)}
          </span>
          {speaker}
        </>
      ) : (
        "+ Add speaker"
      )}
    </button>
  );
}
