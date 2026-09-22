"use client";

import { useState } from "react";
import Link from "next/link";
import { AudioLines, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectRow } from "@/components/dashboard/ProjectRow";
import { GithubLink } from "@/components/GithubLink";
import type { Project } from "@/types/project";

export function Dashboard({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);

  const handleRenamed = (id: string, name: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const handleDeleted = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <div className="mb-10 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <AudioLines className="size-4" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-[0.85rem] font-semibold">AI Video Editor</span>
            <span className="text-[0.7rem] text-muted-foreground">Edit video like you edit text</span>
          </div>
        </div>
        <GithubLink />
      </div>

      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length === 0
              ? "Upload a video to get started"
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/new">
            <FolderPlus className="size-3.5" />
            New project
          </Link>
        </Button>
      </header>

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-24 text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
            <FolderPlus className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-foreground">No projects yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Upload a video to auto-transcribe it, then edit the video by editing the words.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/new">New project</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
