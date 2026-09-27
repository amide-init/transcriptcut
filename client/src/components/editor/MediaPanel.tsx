"use client";

import { useMemo, useRef, useState } from "react";
import { Film, ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { useMediaStore } from "@/stores/media-store";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { formatTimecode } from "@/lib/timeline/format";
import { Button } from "@/components/ui/button";
import {
  OVERLAY_CORNERS,
  type OverlayCorner,
  type OverlayMode,
  type OverlayOperation,
} from "@/types/edit-operation";
import type { MediaItem } from "@/types/media";

/** How long new B-roll lasts when there's no transcript selection to cover. */
const DEFAULT_IMAGE_SECONDS = 4;
const DEFAULT_VIDEO_SECONDS = 5;

const CORNER_LABELS: Record<OverlayCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

type Upload = { name: string; progress: number; error?: string };

function MediaThumb({ item, className }: { item: MediaItem; className: string }) {
  return item.type === "image" ? (
    <img src={item.url} alt="" className={className} draggable={false} />
  ) : (
    // #t= makes the browser show a frame from just into the clip rather than a black first frame.
    <video src={`${item.url}#t=0.5`} muted preload="metadata" className={className} />
  );
}

/**
 * The media library: upload images and clips, then lay them over the
 * footage as B-roll -- over the words selected in the transcript, or from
 * the playhead. Each use is an overlay operation, so it follows cuts and
 * goes through undo/redo; the library refuses to delete a file in use.
 */
export function MediaPanel() {
  const items = useMediaStore((s) => s.items);
  const upload = useMediaStore((s) => s.upload);
  const remove = useMediaStore((s) => s.remove);
  const operations = useTimelineStore((s) => s.operations);
  const addOperations = useTimelineStore((s) => s.addOperations);
  const replaceOperation = useTimelineStore((s) => s.replaceOperation);
  const removeOperations = useTimelineStore((s) => s.removeOperations);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  const transcript = useTranscriptStore((s) => s.transcript);
  const selectedWordIds = useTranscriptStore((s) => s.selectedWordIds);
  const clearSelection = useTranscriptStore((s) => s.clearSelection);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaById = useMemo(() => new Map(items.map((m) => [m.id, m])), [items]);
  const overlays = useMemo(
    () =>
      operations
        .filter((op): op is OverlayOperation => op.type === "overlay")
        .sort((a, b) => a.start - b.start),
    [operations]
  );
  const selection = useMemo(() => {
    if (selectedWordIds.length === 0 || !transcript) return null;
    const ids = new Set(selectedWordIds);
    const words = transcript.segments.flatMap((s) => s.words).filter((w) => ids.has(w.id));
    if (words.length === 0) return null;
    return { start: Math.min(...words.map((w) => w.start)), end: Math.max(...words.map((w) => w.end)) };
  }, [selectedWordIds, transcript]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, progress: 0 }]);
      const update = (patch: Partial<Upload>) =>
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, ...patch } : x)));
      try {
        await upload(file, (progress) => update({ progress }));
        setUploads((u) => u.filter((x) => x.name !== file.name));
      } catch (err) {
        update({ error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
  };

  const addBroll = (item: MediaItem) => {
    const range = selection ?? {
      start: currentTime,
      end: Math.min(
        duration,
        currentTime +
          (item.type === "video" ? Math.min(DEFAULT_VIDEO_SECONDS, item.duration ?? DEFAULT_VIDEO_SECONDS) : DEFAULT_IMAGE_SECONDS)
      ),
    };
    if (range.end - range.start < 0.2) {
      setError("Move the playhead earlier -- there's no room for B-roll before the end.");
      return;
    }
    const op: OverlayOperation = {
      id: crypto.randomUUID(),
      type: "overlay",
      assetId: item.id,
      start: range.start,
      end: range.end,
      mode: "full",
      createdAt: Date.now(),
    };
    addOperations([op]);
    if (selection) clearSelection();
    setError(null);
  };

  const update = (op: OverlayOperation, patch: { mode?: OverlayMode; corner?: OverlayCorner }) =>
    replaceOperation(op.id, { ...op, ...patch, id: crypto.randomUUID() });

  const deleteMedia = async (item: MediaItem) => {
    try {
      await remove(item.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that file.");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-xs">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/*"
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        <Upload className="size-3.5" />
        Upload images or clips
      </Button>
      <p className="text-muted-foreground">
        {selection
          ? `Adding covers the ${selectedWordIds.length} selected word${selectedWordIds.length === 1 ? "" : "s"} (${formatTimecode(selection.start)}–${formatTimecode(selection.end)}).`
          : "Adding starts at the playhead. Select words in the transcript to cover exactly them."}
      </p>

      {uploads.map((u) => (
        <div key={u.name} className="flex items-center gap-2 rounded-md border border-border p-2">
          <span className="min-w-0 flex-1 truncate">{u.name}</span>
          {u.error ? (
            <>
              <span className="text-destructive">{u.error}</span>
              <button type="button" onClick={() => setUploads((x) => x.filter((y) => y !== u))} title="Dismiss">
                <X className="size-3" />
              </button>
            </>
          ) : (
            <span className="font-mono tabular-nums text-muted-foreground">{Math.round(u.progress * 100)}%</span>
          )}
        </div>
      ))}
      {error && <p className="rounded-md bg-destructive/10 p-2 text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-muted-foreground">
          No media yet. Upload product shots, screen recordings or photos to cut away to while the conversation keeps
          playing.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-md border border-border">
              <MediaThumb item={item} className="aspect-video w-full bg-muted object-cover" />
              <div className="flex items-center gap-1 px-1.5 py-1">
                {item.type === "image" ? (
                  <ImageIcon className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <Film className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate" title={item.name}>
                  {item.name}
                </span>
                {item.duration !== null && (
                  <span className="font-mono text-muted-foreground tabular-nums">{formatTimecode(item.duration)}</span>
                )}
              </div>
              <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button size="xs" onClick={() => addBroll(item)} title="Use as B-roll">
                  <Plus className="size-3" />
                  Add
                </Button>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  onClick={() => void deleteMedia(item)}
                  title="Delete from library"
                  className="hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {overlays.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">B-roll on the timeline</span>
          {overlays.map((op) => {
            const item = mediaById.get(op.assetId);
            return (
              <div key={op.id} className="flex flex-col gap-1.5 rounded-md border border-border p-1.5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => seek(op.start)} title="Jump to it" className="shrink-0">
                    {item ? (
                      <MediaThumb item={item} className="h-8 w-14 rounded-sm bg-muted object-cover" />
                    ) : (
                      <span className="block h-8 w-14 rounded-sm bg-muted" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item?.name ?? "Missing file"}</div>
                    <div className="font-mono text-muted-foreground tabular-nums">
                      {formatTimecode(op.start)}–{formatTimecode(op.end)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeOperations([op.id])}
                    title="Remove this B-roll"
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  {(["full", "pip"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => op.mode !== mode && update(op, { mode })}
                      className={`rounded border px-1.5 py-0.5 text-[0.7rem] ${
                        op.mode === mode
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {mode === "full" ? "Full screen" : "Picture in picture"}
                    </button>
                  ))}
                  {op.mode === "pip" && (
                    <select
                      value={op.corner ?? "bottom-right"}
                      onChange={(e) => update(op, { corner: e.target.value as OverlayCorner })}
                      aria-label="Corner"
                      className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-1 text-[0.7rem] focus:border-primary focus:outline-none"
                    >
                      {OVERLAY_CORNERS.map((c) => (
                        <option key={c} value={c}>
                          {CORNER_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
