"use client";

import { useState } from "react";
import Link from "next/link";
import { Captions, FolderKanban, SlidersHorizontal, Sliders, Wand2 } from "lucide-react";
import { AiToolsPanel } from "@/components/editor/AiToolsPanel";
import { FiltersPanel } from "@/components/editor/FiltersPanel";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { CaptionsPanel } from "@/components/editor/CaptionsPanel";

type PanelId = "ai" | "filters" | "properties" | "captions";

const RAIL_ITEMS: { id: PanelId; label: string; icon: typeof Wand2 }[] = [
  { id: "ai", label: "AI tools", icon: Wand2 },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "properties", label: "Properties", icon: Sliders },
  { id: "captions", label: "Captions", icon: Captions },
];

/** The editor's right sidebar: a fixed 100px icon rail, plus a 250px panel that opens to its left. */
export function EditorSidebar() {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  const toggle = (id: PanelId) => setActivePanel((current) => (current === id ? null : id));

  const activeItem = RAIL_ITEMS.find((item) => item.id === activePanel);

  return (
    <div className="flex h-full shrink-0 gap-3">
      {activeItem && (
        <div className="flex w-[250px] flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-[0.8rem] font-medium text-foreground">
            {activeItem.label}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {activePanel === "ai" && <AiToolsPanel />}
            {activePanel === "filters" && <FiltersPanel />}
            {activePanel === "properties" && <PropertiesPanel />}
            {activePanel === "captions" && <CaptionsPanel />}
          </div>
        </div>
      )}
      <div className="flex w-[100px] shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-card py-3">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const selected = activePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className={`flex w-[84px] flex-col items-center gap-1 rounded-md py-2 text-center text-[0.7rem] leading-tight transition-colors ${
                selected
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
        <div className="my-1 h-px w-8 bg-border" />
        <Link
          href="/"
          className="flex w-[84px] flex-col items-center gap-1 rounded-md py-2 text-center text-[0.7rem] leading-tight text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FolderKanban className="size-4" />
          Projects
        </Link>
      </div>
    </div>
  );
}
