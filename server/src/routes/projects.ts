import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { deleteProjectDir, ensureProjectDirs } from "@/lib/storage/local";
import { createProjectSchema, updateProjectSchema } from "@/lib/validation/project";
import { errorResponse } from "@/lib/http";
import type { Project } from "@/types/project";
import type { Transcript } from "@/types/transcript";
import type { EditOperation } from "@/types/edit-operation";

export const projectsRoute = new Hono();

// GET /api/projects -- list, with the derived fields the dashboard needs
// (hasVideo/hasTranscript/cutCount). The old Next app computed these only
// inside its Server Component page, not this API route -- ported here now
// that there's no server-rendered page to do it instead.
projectsRoute.get("/", async (c) => {
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

  return c.json({ success: true, projects });
});

projectsRoute.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_PROJECT", parsed.error.issues[0]?.message ?? "Invalid project.", 400);
  }

  const project = await prisma.project.create({ data: { name: parsed.data.name } });
  await ensureProjectDirs(project.id);

  return c.json({ success: true, project }, 201);
});

projectsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      assets: true,
      transcript: true,
      editOperations: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }

  const transcript: Transcript | null = project.transcript
    ? { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) }
    : null;

  const operations: EditOperation[] = project.editOperations.map(
    (op) => JSON.parse(op.dataJson) as EditOperation
  );

  const originalAsset = project.assets.find((a) => a.kind === "original") ?? null;
  const logoAsset = project.assets.find((a) => a.kind === "logo") ?? null;

  return c.json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
      duration: project.duration,
      filterId: project.filterId,
      burnInCaptions: project.burnInCaptions,
      captionStyle: project.captionStyleJson ? JSON.parse(project.captionStyleJson) : null,
      properties: project.propertiesJson ? JSON.parse(project.propertiesJson) : null,
      logoPosition: project.logoPosition,
      logoPaddingX: project.logoPaddingX,
      logoPaddingY: project.logoPaddingY,
      logoOpacity: project.logoOpacity,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    transcript,
    operations,
    videoUrl: originalAsset ? `/api/projects/${project.id}/video` : null,
    logoUrl: logoAsset ? `/api/projects/${project.id}/logo` : null,
  });
});

projectsRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid update.", 400);
  }

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }

  const project = await prisma.project.update({ where: { id }, data: parsed.data });

  return c.json({ success: true, project });
});

projectsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const exists = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }

  await prisma.project.delete({ where: { id } });
  await deleteProjectDir(id);

  return c.json({ success: true });
});
