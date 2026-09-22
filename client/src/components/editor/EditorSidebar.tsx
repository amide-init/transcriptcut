"use client";

import { useState } from "react";
import { Captions, ImagePlus, SlidersHorizontal, Sliders, Wand2 } from "lucide-react";
import { AiToolsPanel } from "@/components/editor/AiToolsPanel";
import { FiltersPanel } from "@/components/editor/FiltersPanel";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { ElementsPanel } from "@/components/editor/ElementsPanel";
import { CaptionsPanel } from "@/components/editor/CaptionsPanel";

type PanelId = "captions" | "ai" | "filters" | "properties" | "elements";

const TABS: { id: PanelId; label: string; icon: typeof Wand2 }[] = [
  { id: "captions", label: "Captions", icon: Captions },
  { id: "ai", label: "AI tools", icon: Wand2 },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "elements", label: "Elements", icon: ImagePlus },
  { id: "properties", label: "Settings", icon: Sliders },
];

/** The editor's right sidebar: one card with a horizontal tab row up top and the active tool's panel below. */
export function EditorSidebar() {
  const [activePanel, setActivePanel] = useState<PanelId>("captions");

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePanel(tab.id)}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-center text-[0.65rem] leading-tight transition-colors ${
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
      <div className="flex-1 overflow-y-auto p-3">
        {activePanel === "captions" && <CaptionsPanel />}
        {activePanel === "ai" && <AiToolsPanel />}
        {activePanel === "filters" && <FiltersPanel />}
        {activePanel === "elements" && <ElementsPanel />}
        {activePanel === "properties" && <PropertiesPanel />}
      </div>
    </div>
  );
}
