"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { VideoPlayer } from "@/components/video-player/VideoPlayer";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { AskAI } from "@/components/ai/AskAI";
import { FilterDrawer } from "@/components/editor/FilterDrawer";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" disabled>
                  Export
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Rendering isn&apos;t wired up yet</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="min-h-0 overflow-hidden rounded-lg border border-border bg-black">
          <VideoPlayer videoUrl={videoUrl} />
        </div>
        <div className="min-h-0 overflow-hidden rounded-lg border border-border bg-card">
          <TranscriptPanel />
        </div>
      </div>

      <Timeline />
      <AskAI />
    </div>
  );
}
