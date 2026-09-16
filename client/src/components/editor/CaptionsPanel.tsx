"use client";

import {
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_THEMES,
  type CaptionPosition,
  type CaptionStyle,
} from "@/lib/captions/style";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";

const FONT_SIZES = [16, 20, 24, 28, 32, 40, 48];

export function CaptionsPanel() {
  const projectId = useProjectStore((s) => s.id);
  const burnInCaptions = useCaptionStyleStore((s) => s.burnInCaptions);
  const setBurnInCaptions = useCaptionStyleStore((s) => s.setBurnInCaptions);
  const style = useCaptionStyleStore((s) => s.style);
  const onChange = useCaptionStyleStore((s) => s.setStyle);

  return (
    <div className="flex flex-col gap-4 text-xs">
      <label className="flex items-center gap-1.5 text-muted-foreground">
        <input
          type="checkbox"
          checked={burnInCaptions}
          onChange={(e) => setBurnInCaptions(e.target.checked)}
          className="accent-primary"
        />
        Burn in captions
      </label>

      {projectId && (
        <div className="flex flex-col gap-1 text-muted-foreground">
          <a href={`/api/projects/${projectId}/captions?format=srt`} download className="hover:text-foreground">
            Download SRT
          </a>
          <a href={`/api/projects/${projectId}/captions?format=vtt`} download className="hover:text-foreground">
            Download VTT
          </a>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        Theme
        <div className="grid grid-cols-2 gap-2">
          {CAPTION_THEMES.map((theme) => {
            const selected = JSON.stringify(theme.style) === JSON.stringify(style);
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChange(theme.style)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <span className="flex h-9 w-full items-center justify-center rounded bg-neutral-800 text-[0.7rem] font-medium">
                  <span
                    style={{
                      fontFamily: theme.style.font,
                      WebkitTextStroke: `0.5px ${theme.style.outlineColor}`,
                      ...(theme.style.background
                        ? { backgroundColor: "rgba(0,0,0,0.7)", padding: "1px 6px", borderRadius: 3 }
                        : {}),
                    }}
                  >
                    {theme.style.wordHighlight ? (
                      <>
                        <span style={{ color: theme.style.highlightColor }}>A</span>
                        <span style={{ color: theme.style.textColor }}>a</span>
                      </>
                    ) : (
                      <span style={{ color: theme.style.textColor }}>Aa</span>
                    )}
                  </span>
                </span>
                <span className="text-foreground">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        Font
        <select
          value={style.font}
          onChange={(e) => onChange({ ...style, font: e.target.value as CaptionStyle["font"] })}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground"
        >
          {CAPTION_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        Size
        <select
          value={style.fontSize}
          onChange={(e) => onChange({ ...style, fontSize: Number(e.target.value) })}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          Text color
          <input
            type="color"
            value={style.textColor}
            onChange={(e) => onChange({ ...style, textColor: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-transparent p-0.5"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          Outline color
          <input
            type="color"
            value={style.outlineColor}
            onChange={(e) => onChange({ ...style, outlineColor: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-transparent p-0.5"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        Position
        <div className="flex gap-1.5">
          {CAPTION_POSITIONS.map((position) => (
            <Button
              key={position}
              type="button"
              size="xs"
              variant={style.position === position ? "default" : "outline"}
              onClick={() => onChange({ ...style, position: position as CaptionPosition })}
              className="flex-1 capitalize"
            >
              {position}
            </Button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={style.background}
          onChange={(e) => onChange({ ...style, background: e.target.checked })}
          className="accent-primary"
        />
        Background box behind text
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={style.wordHighlight}
            onChange={(e) => onChange({ ...style, wordHighlight: e.target.checked })}
            className="accent-primary"
          />
          Highlight each word as it is spoken (preview only)
        </label>
        {style.wordHighlight && (
          <label className="flex flex-col gap-1">
            Highlight color
            <input
              type="color"
              value={style.highlightColor}
              onChange={(e) => onChange({ ...style, highlightColor: e.target.value })}
              className="h-8 w-full rounded-lg border border-input bg-transparent p-0.5"
            />
          </label>
        )}
      </div>
    </div>
  );
}
