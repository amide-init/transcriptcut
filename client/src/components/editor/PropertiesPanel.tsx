"use client";

import { RotateCcw } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { DEFAULT_VIDEO_PROPERTIES, VIDEO_PROPERTY_FIELDS } from "@/types/video-properties";

const SECTIONS = ["Color", "Light"] as const;

export function PropertiesPanel() {
  const properties = useProjectStore((s) => s.properties);
  const setProperties = useProjectStore((s) => s.setProperties);

  const isDefault = SECTIONS.every((section) =>
    VIDEO_PROPERTY_FIELDS.filter((f) => f.section === section).every(
      (f) => properties[f.key] === DEFAULT_VIDEO_PROPERTIES[f.key]
    )
  );

  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            {section}
          </span>
          {VIDEO_PROPERTY_FIELDS.filter((f) => f.section === section).map((field) => {
            const value = properties[field.key];
            return (
              <label key={field.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-foreground">
                  <span>{field.label}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{value}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={value}
                  onChange={(e) =>
                    setProperties({ ...properties, [field.key]: Number(e.target.value) })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
                />
              </label>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setProperties(DEFAULT_VIDEO_PROPERTIES)}
        disabled={isDefault}
        className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <RotateCcw className="size-3.5" />
        Reset to default
      </button>
    </div>
  );
}
