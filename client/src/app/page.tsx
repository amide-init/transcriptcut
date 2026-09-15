"use client";

import { useProjectStore } from "@/stores/project-store";
import { UploadScreen } from "@/components/editor/UploadScreen";
import { EditorLayout } from "@/components/editor/EditorLayout";

export default function Home() {
  const status = useProjectStore((s) => s.status);
  const videoUrl = useProjectStore((s) => s.videoUrl);

  if (status === "ready" && videoUrl) {
    return <EditorLayout videoUrl={videoUrl} />;
  }

  return <UploadScreen />;
}
