import { Hono } from "hono";
import { prisma } from "@/lib/db/client";
import { editOperationSchema } from "@/lib/validation/edit-operation";
import { errorResponse } from "@/lib/http";

export const operationsRoute = new Hono();

operationsRoute.post("/:id/operations", async (c) => {
  const projectId = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, "INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = editOperationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, "INVALID_OPERATION", parsed.error.issues[0]?.message ?? "Invalid edit operation.", 400);
  }

  const op = parsed.data;
  if ((op.type === "cut" || op.type === "trim") && op.end <= op.start) {
    return errorResponse(c, "INVALID_OPERATION", "end must be after start.", 400);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, duration: true } });
  if (!project) {
    return errorResponse(c, "NOT_FOUND", "Project not found.", 404);
  }
  // A split at 0 only names the first scene; one at or past the end would make an empty scene.
  if (op.type === "split" && project.duration && op.timestamp >= project.duration) {
    return errorResponse(c, "INVALID_OPERATION", "Split must fall inside the video.", 400);
  }
  // A card at the duration is an outro; past it there's nothing to play before.
  if (op.type === "card" && project.duration && op.at > project.duration) {
    return errorResponse(c, "INVALID_OPERATION", "Card must be placed inside the video.", 400);
  }
  if (op.type === "transition" && project.duration && op.at > project.duration) {
    return errorResponse(c, "INVALID_OPERATION", "Transition must be placed inside the video.", 400);
  }

  // Client generates the id (needed so undo/redo can address the exact row);
  // upsert so a redo that restores a previously-undone op is idempotent.
  const saved = await prisma.editOperation.upsert({
    where: { id: op.id },
    create: { id: op.id, projectId, type: op.type, dataJson: JSON.stringify(op) },
    update: { dataJson: JSON.stringify(op) },
  });

  return c.json({ success: true, operation: JSON.parse(saved.dataJson) }, 201);
});

operationsRoute.delete("/:id/operations/:operationId", async (c) => {
  const projectId = c.req.param("id");
  const operationId = c.req.param("operationId");

  const op = await prisma.editOperation.findUnique({ where: { id: operationId } });
  if (!op || op.projectId !== projectId) {
    return errorResponse(c, "NOT_FOUND", "Operation not found.", 404);
  }

  await prisma.editOperation.delete({ where: { id: operationId } });
  return c.json({ success: true });
});
