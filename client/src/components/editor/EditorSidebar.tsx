"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, BookOpenText, Captions, ChevronLeft, Clapperboard, ChevronRight, Film, ImagePlus, SlidersHorizontal, Sliders, Wand2 } from "lucide-react";
import { AiToolsPanel } from "@/components/editor/AiToolsPanel";
import { FiltersPanel } from "@/components/editor/FiltersPanel";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { ElementsPanel } from "@/components/editor/ElementsPanel";
import { CaptionsPanel } from "@/components/editor/CaptionsPanel";
import { AudioPanel } from "@/components/editor/AudioPanel";
import { PublishPanel } from "@/components/editor/PublishPanel";
import { ClipsPanel } from "@/components/editor/ClipsPanel";
import { ScenesPanel } from "@/components/editor/ScenesPanel";

type PanelId = "captions" | "scenes" | "audio" | "publish" | "clips" | "ai" | "filters" | "properties" | "elements";

const TABS: { id: PanelId; label: string; icon: typeof Wand2 }[] = [
  { id: "captions", label: "Captions", icon: Captions },
  { id: "scenes", label: "Scenes", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "publish", label: "Publish", icon: BookOpenText },
  { id: "clips", label: "Clips", icon: Clapperboard },
  { id: "ai", label: "AI tools", icon: Wand2 },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "elements", label: "Elements", icon: ImagePlus },
  { id: "properties", label: "Settings", icon: Sliders },
];

/** The editor's right sidebar: a horizontally-sliding tab strip (arrows appear once tabs overflow) plus the active tool's panel below. */
export function EditorSidebar() {
  const [activePanel, setActivePanel] = useState<PanelId>("captions");
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  const slide = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: direction * 0.9 * (scrollRef.current?.clientWidth ?? 0), behavior: "smooth" });
  };

  const selectPanel = (id: PanelId) => {
    setActivePanel(id);
    tabRefs.current[id]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  };

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center border-b border-border">
        <button
          type="button"
          onClick={() => slide(-1)}
          disabled={!canScrollLeft}
          className="flex h-11 w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <div
          ref={scrollRef}
          className="flex flex-1 overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activePanel === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => selectPanel(tab.id)}
                className={`relative flex w-[70px] shrink-0 flex-col items-center gap-1 py-2.5 text-center text-[0.65rem] leading-tight transition-colors ${
                  selected ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
                {selected && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => slide(1)}
          disabled={!canScrollRight}
          className="flex h-11 w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {activePanel === "captions" && <CaptionsPanel />}
        {activePanel === "scenes" && <ScenesPanel />}
        {activePanel === "audio" && <AudioPanel />}
        {activePanel === "publish" && <PublishPanel />}
        {activePanel === "clips" && <ClipsPanel />}
        {activePanel === "ai" && <AiToolsPanel />}
        {activePanel === "filters" && <FiltersPanel />}
        {activePanel === "elements" && <ElementsPanel />}
        {activePanel === "properties" && <PropertiesPanel />}
      </div>
    </div>
  );
}
