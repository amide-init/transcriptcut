import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EditorHydrator } from "@/components/editor/EditorHydrator";
import { NotFoundRoute } from "@/routes/NotFoundRoute";
import { toLogoPosition } from "@/lib/video/logo";
import type { Transcript } from "@/types/transcript";
import type { EditOperation } from "@/types/edit-operation";
import type { CaptionStyle } from "@/lib/captions/style";
import type { VideoProperties } from "@/types/video-properties";

type ProjectDetailResponse = {
  success: true;
  project: {
    id: string;
    name: string;
    duration: number | null;
    filterId: string;
    burnInCaptions: boolean;
    captionStyle: CaptionStyle | null;
    properties: VideoProperties | null;
    logoPosition: string;
    logoPaddingX: number;
    logoPaddingY: number;
    logoOpacity: number;
    createdAt: string;
    updatedAt: string;
  };
  transcript: Transcript | null;
  operations: EditOperation[];
  videoUrl: string | null;
  audioUrl: string | null;
  logoUrl: string | null;
};

type FetchState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error" }
  | ({ status: "loaded" } & ProjectDetailResponse);

export function EditorRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch(`/api/projects/${projectId}`)
      .then(async (res) => {
        if (res.status === 404) return { status: "not-found" as const };
        if (!res.ok) return { status: "error" as const };
        const data: ProjectDetailResponse = await res.json();
        return { status: "loaded" as const, ...data };
      })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (state.status === "loading") {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (state.status === "not-found") {
    return <NotFoundRoute />;
  }
  if (state.status === "error") {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-destructive">
        Could not load this project. Try refreshing.
      </div>
    );
  }

  const { project, transcript, operations, videoUrl, audioUrl, logoUrl } = state;

  return (
    <EditorHydrator
      project={{
        id: project.id,
        name: project.name,
        filterId: project.filterId,
        burnInCaptions: project.burnInCaptions,
        captionStyle: project.captionStyle,
        properties: project.properties,
        logoPosition: toLogoPosition(project.logoPosition),
        logoPaddingX: project.logoPaddingX,
        logoPaddingY: project.logoPaddingY,
        logoOpacity: project.logoOpacity,
        videoUrl,
        audioUrl,
        logoUrl,
      }}
      transcript={transcript}
      operations={operations}
    />
  );
}
