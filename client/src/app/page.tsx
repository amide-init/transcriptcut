import { prisma } from "@/lib/db/client";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { Project } from "@/types/project";

// Reads live project data on every request — must not be statically cached
// at build time (the default Next.js would otherwise pick for a page with
// no dynamic APIs/params).
export const dynamic = "force-dynamic";

export default async function Home() {
  const rows = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      assets: { select: { kind: true } },
      transcript: { select: { id: true } },
      _count: { select: { editOperations: true } },
    },
  });

  const projects: Project[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    duration: p.duration,
    filterId: p.filterId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    hasVideo: p.assets.some((a) => a.kind === "original"),
    hasTranscript: p.transcript !== null,
    cutCount: p._count.editOperations,
  }));

  return <Dashboard initialProjects={projects} />;
}
