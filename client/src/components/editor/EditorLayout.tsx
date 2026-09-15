"use client";

import { useProjectStore } from "@/stores/project-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { VideoPlayer } from "@/components/video-player/VideoPlayer";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { FilterDrawer } from "@/components/editor/FilterDrawer";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function EditorLayout({ videoUrl }: { videoUrl: string }) {
  const name = useProjectStore((s) => s.name);
  const resetProject = useProjectStore((s) => s.reset);
  const resetTranscript = useTranscriptStore((s) => s.setTranscript);
  const resetTimeline = useTimelineStore((s) => s.reset);

  const handleNewProject = () => {
    resetProject();
    resetTranscript(null);
    resetTimeline();
  };

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h1 className="text-[0.95rem] font-medium">{name}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNewProject}>
            New project
          </Button>
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
    </div>
  );
}
