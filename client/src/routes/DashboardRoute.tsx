import { useEffect, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { Project } from "@/types/project";

export function DashboardRoute() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data: { success: true; projects: Project[] }) => {
        if (!cancelled) setProjects(data.projects);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (projects === null) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return <Dashboard initialProjects={projects} />;
}
