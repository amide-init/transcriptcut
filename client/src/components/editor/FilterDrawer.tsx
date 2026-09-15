"use client";

import { useEffect, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";
import { FILTER_PRESETS } from "@/lib/video/filters";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 135;

export function FilterDrawer() {
  const [open, setOpen] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const videoElement = usePlayerStore((s) => s.videoElement);
  const filterId = useProjectStore((s) => s.filterId);
  const setFilterId = useProjectStore((s) => s.setFilterId);

  // Grab a still frame from the video the moment the drawer opens, so each
  // preset swatch previews the actual footage rather than a placeholder.
  useEffect(() => {
    if (!open || !videoElement || videoElement.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoElement, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    try {
      // Reading a frame via canvas is an imperative browser-API call, not
      // state derivable from props/state, so it has to happen in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThumbnail(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setThumbnail(null);
    }
  }, [open, videoElement]);

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <DrawerTrigger asChild>
        <Button variant="outline" size="sm">
          Filters
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>
            Preview only, for now — baked in when export is wired up.
          </DrawerDescription>
        </DrawerHeader>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 pt-0">
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
                    // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL, not a static asset
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
      </DrawerContent>
    </Drawer>
  );
}
