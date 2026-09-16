"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { VideoPlayer } from "@/components/video-player/VideoPlayer";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { FilterDrawer } from "@/components/editor/FilterDrawer";
import { ExportButton } from "@/components/editor/ExportButton";

export function EditorLayout({ videoUrl }: { videoUrl: string }) {
  const name = useProjectStore((s) => s.name);

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
          <h1 className="text-[0.95rem] font-medium">{name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <FilterDrawer />
          <ExportButton />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-3">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
          <div className="aspect-video w-full max-h-full">
            <VideoPlayer videoUrl={videoUrl} />
          </div>
        </div>
        <div className="min-h-0 overflow-hidden rounded-lg border border-border bg-card">
          <TranscriptPanel />
        </div>
      </div>

      <Timeline />
    </div>
  );
}
