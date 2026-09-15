"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectRow } from "@/components/dashboard/ProjectRow";
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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-medium">Projects</h1>
        <Button asChild size="sm">
          <Link href="/new">New project</Link>
        </Button>
      </header>

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-foreground">No projects yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Upload a video to auto-transcribe it, then edit the video by editing the words.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/new">New project</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-border">
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
