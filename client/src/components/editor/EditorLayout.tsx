"use client";

import Link from "next/link";
import { FolderKanban, Home } from "lucide-react";
import { VideoPlayer } from "@/components/video-player/VideoPlayer";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { ExportButton } from "@/components/editor/ExportButton";
import { ProjectNameField } from "@/components/editor/ProjectNameField";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/stores/player-store";

export function EditorLayout({ videoUrl }: { videoUrl: string }) {
  // Matches the preview's aspect box to the source video's own aspect ratio
  // (falling back to 16:9 until it's known) instead of forcing every video
  // into a fixed 16:9 box -- that produced pillarbox/letterbox bars in the
  // editor for non-16:9 video that the actual ffmpeg export never had,
  // since export doesn't touch aspect ratio at all.
  const aspectRatio = usePlayerStore((s) => s.aspectRatio);

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
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/">
              <FolderKanban className="size-3.5" />
              Projects
            </Link>
          </Button>
          <ProjectNameField />
        </div>
        <ExportButton />
      </nav>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 flex-[2] items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
          <div className="w-full max-h-full" style={{ aspectRatio: aspectRatio ?? 16 / 9 }}>
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
