"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { EditorLayout } from "@/components/editor/EditorLayout";
import type { Transcript } from "@/types/transcript";
import type { EditOperation } from "@/types/edit-operation";
import type { CaptionStyle } from "@/lib/captions/style";
import type { VideoProperties } from "@/types/video-properties";
import type { LogoPosition } from "@/lib/video/logo";

type HydrateProject = {
  id: string;
  name: string;
  filterId: string;
  burnInCaptions: boolean;
  captionStyle: CaptionStyle | null;
  properties: VideoProperties | null;
  logoPosition: LogoPosition;
  logoPaddingX: number;
  logoPaddingY: number;
  logoOpacity: number;
  videoUrl: string | null;
  logoUrl: string | null;
};

/** Loads a project fetched server-side into the client stores, then renders the editor. */
export function EditorHydrator({
  project,
  transcript,
  operations,
}: {
  project: HydrateProject;
  transcript: Transcript | null;
  operations: EditOperation[];
}) {
  const hydrateProject = useProjectStore((s) => s.hydrate);
  const setTranscript = useTranscriptStore((s) => s.setTranscript);
  const hydrateTimeline = useTimelineStore((s) => s.hydrate);
  const hydrateCaptionStyle = useCaptionStyleStore((s) => s.hydrate);

  useEffect(() => {
    hydrateProject(project);
    setTranscript(transcript);
    hydrateTimeline(project.id, operations);
    hydrateCaptionStyle(project.id, project.burnInCaptions, project.captionStyle);
    // Only re-hydrate when navigating to a different project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  if (!project.videoUrl) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        No video uploaded for this project yet.
      </div>
    );
  }

  return <EditorLayout videoUrl={project.videoUrl} />;
}
