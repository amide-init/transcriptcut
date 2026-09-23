"use client";

import { useEffect, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { FILTER_PRESETS } from "@/lib/video/filters";

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 135;

export function FiltersPanel() {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const videoElement = usePlayerStore((s) => s.videoElement);
  const filterId = useProjectStore((s) => s.filterId);
  const setFilterId = useProjectStore((s) => s.setFilterId);

  // Grab a still frame from the video on mount, so each preset swatch
  // previews the actual footage rather than a placeholder.
  useEffect(() => {
    if (!videoElement || videoElement.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoElement, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    try {
      // Reading a frame via canvas is an imperative browser-API call, not
      // state derivable from props/state, so it has to happen in an effect.
      setThumbnail(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setThumbnail(null);
    }
  }, [videoElement]);

  return (
    <div className="grid grid-cols-2 gap-2">
      {FILTER_PRESETS.map((preset) => {
        const selected = preset.id === filterId;
        return (
          <button
            key={preset.id}
            onClick={() => setFilterId(preset.id)}
            className={[
              "flex flex-col gap-1.5 rounded-md p-1.5 text-left transition-colors",
              selected ? "bg-accent/15 ring-1 ring-accent" : "hover:bg-muted",
            ].join(" ")}
          >
            <div className="aspect-video w-full overflow-hidden rounded bg-muted">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt=""
                  style={{ filter: preset.css }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="h-full w-full bg-gradient-to-br from-secondary to-muted"
                  style={{ filter: preset.css }}
                />
              )}
            </div>
            <span className="text-xs text-foreground">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
