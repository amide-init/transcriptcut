"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { VideoPlayer } from "@/components/video-player/VideoPlayer";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { ExportButton } from "@/components/editor/ExportButton";

export function EditorLayout({ videoUrl }: { videoUrl: string }) {
  const name = useProjectStore((s) => s.name);

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <nav className="flex h-9 shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="All projects"
          >
            <Home className="size-4" />
          </Link>
          <h1 className="text-[0.95rem] font-medium">{name}</h1>
        </div>
        <ExportButton />
      </nav>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 flex-[2] items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
          <div className="aspect-video w-full max-h-full">
            <VideoPlayer videoUrl={videoUrl} />
          </div>
        </div>
        <div className="min-h-0 flex-[3] overflow-hidden rounded-lg border border-border bg-card">
          <TranscriptPanel />
        </div>
        <EditorSidebar />
      </div>

      <Timeline />
    </div>
  );
}
