import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { ensureProjectDirs } from "@/lib/storage/local";
import { createProjectSchema } from "@/lib/validation/project";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ success: true, projects });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "Expected a JSON body.", 400);
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_PROJECT", parsed.error.issues[0]?.message ?? "Invalid project.", 400);
  }

  const project = await prisma.project.create({
    data: { name: parsed.data.name },
  });
  await ensureProjectDirs(project.id);

  return NextResponse.json({ success: true, project }, { status: 201 });
}
