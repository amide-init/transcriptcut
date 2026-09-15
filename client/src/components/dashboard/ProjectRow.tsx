"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
  AlertDialogTrigger,
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
    <div className="group flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setNameDraft(project.name);
                setRenaming(false);
              }
            }}
            className="h-7 max-w-xs"
          />
        ) : (
          <Link href={`/editor/${project.id}`} className="block truncate font-medium hover:underline">
            {project.name}
          </Link>
        )}
        <div className="mt-0.5 flex gap-2 font-mono text-xs text-muted-foreground">
          {duration && <span>{duration}</span>}
          <span>Updated {formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="xs" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{project.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the project, its transcript, edits, and the uploaded video from disk.
                This can&apos;t be undone.
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
    </div>
  );
}
