"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Captions, Film, MoreVertical, Scissors } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Project } from "@/types/project";

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Seeks to a frame partway into the clip so the card shows an actual frame
 * instead of the black first frame most videos start on -- there's no
 * dedicated thumbnail asset generated server-side (see claude.md section
 * 15/16), so this reuses the same source the editor streams.
 */
function CardThumbnail({ projectId }: { projectId: string }) {
  return (
    <video
      src={`/api/projects/${projectId}/video`}
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      className="pointer-events-none h-full w-full object-cover"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        if (Number.isFinite(video.duration)) video.currentTime = Math.min(1, video.duration / 2);
      }}
    />
  );
}

export function ProjectRow({
  project,
  onRenamed,
  onDeleted,
}: {
  project: Project;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const commitRename = async () => {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!name || name === project.name) {
      setNameDraft(project.name);
      return;
    }
    onRenamed(project.id, name);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch (err) {
      console.error("Failed to rename project:", err);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      onDeleted(project.id);
    } catch (err) {
      console.error("Failed to delete project:", err);
      setDeleting(false);
    }
  };

  const duration = formatDuration(project.duration);

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <Link
        href={`/editor/${project.id}`}
        className="relative block aspect-video shrink-0 overflow-hidden rounded-t-xl bg-muted"
      >
        {project.hasVideo ? (
          <CardThumbnail projectId={project.id} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film className="size-8 text-muted-foreground/40" />
          </div>
        )}
        {duration && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.65rem] text-white">
            {duration}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setNameDraft(project.name);
                setRenaming(false);
              }
            }}
            className="h-7"
          />
        ) : (
          <Link href={`/editor/${project.id}`} className="truncate text-sm font-medium hover:underline">
            {project.name}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.7rem] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Captions className="size-3" />
            {project.hasTranscript ? "Transcribed" : "No transcript"}
          </span>
          {project.cutCount > 0 && (
            <span className="flex items-center gap-1">
              <Scissors className="size-3" />
              {project.cutCount} {project.cutCount === 1 ? "cut" : "cuts"}
            </span>
          )}
          <span>Updated {formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>

      <div ref={menuRef} className="absolute top-2 right-2">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Project options"
          className="flex size-6 items-center justify-center rounded-md bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical className="size-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute top-full right-0 z-10 mt-1 w-32 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmDeleteOpen(true);
              }}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{project.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the project, its transcript, edits, and the uploaded video from disk. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
