import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { EditorHydrator } from "@/components/editor/EditorHydrator";
import type { Transcript } from "@/types/transcript";
import type { EditOperation } from "@/types/edit-operation";

export default async function EditorPage(props: PageProps<"/editor/[projectId]">) {
  const { projectId } = await props.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assets: true,
      transcript: true,
      editOperations: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) notFound();

  const transcript: Transcript | null = project.transcript
    ? { id: project.transcript.id, segments: JSON.parse(project.transcript.segmentsJson) }
    : null;

  const operations: EditOperation[] = project.editOperations.map(
    (op) => JSON.parse(op.dataJson) as EditOperation
  );

  const hasVideo = project.assets.some((a) => a.kind === "original");

  return (
    <EditorHydrator
      project={{
        id: project.id,
        name: project.name,
        filterId: project.filterId,
        burnInCaptions: project.burnInCaptions,
        captionStyle: project.captionStyleJson ? JSON.parse(project.captionStyleJson) : null,
        properties: project.propertiesJson ? JSON.parse(project.propertiesJson) : null,
        videoUrl: hasVideo ? `/api/projects/${project.id}/video` : null,
      }}
      transcript={transcript}
      operations={operations}
    />
  );
}
