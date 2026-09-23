import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { generateCaptions } from "@/lib/captions/generate";
import { toSrt, toVtt } from "@/lib/captions/format";
import { errorResponse } from "@/lib/http";
import type { Transcript } from "@/types/transcript";
import type { CutOperation, EditOperation } from "@/types/edit-operation";

export const captionsRoute = new Hono();

/** Sidecar caption download -- GET /api/projects/:id/captions?format=srt|vtt */
captionsRoute.get("/:id/captions", async (c) => {
  const id = c.req.param("id");
  const format = c.req.query("format") === "vtt" ? "vtt" : "srt";

  const project = await prisma.project.findUnique({
    where: { id },
    include: { transcript: true, editOperations: true },
  });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }
  if (!project.transcript) {
    return errorResponse(c, "NO_TRANSCRIPT", "This project has no transcript yet.", 400);
  }
  if (project.duration === null) {
    return errorResponse(c, "NO_DURATION", "This project's video duration isn't known yet.", 400);
  }

  const transcript: Transcript = {
    id: project.transcript.id,
    segments: JSON.parse(project.transcript.segmentsJson),
  };
  const cuts = project.editOperations
    .map((op) => JSON.parse(op.dataJson) as EditOperation)
    .filter((op): op is CutOperation => op.type === "cut");

  const cues = generateCaptions(transcript, cuts, project.duration);
  const body = format === "vtt" ? toVtt(cues) : toSrt(cues);
  const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.${format}`;

  return c.body(body, 200, {
    "Content-Type": format === "vtt" ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});
