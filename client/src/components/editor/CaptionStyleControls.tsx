"use client";

import { useState } from "react";
import {
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_THEMES,
  type CaptionPosition,
  type CaptionStyle,
} from "@/lib/captions/style";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

const FONT_SIZES = [16, 20, 24, 28, 32, 40, 48];

export function CaptionStyleControls({
  style,
  onChange,
  disabled,
}: {
  style: CaptionStyle;
  onChange: (style: CaptionStyle) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="right">
      <DrawerTrigger asChild>
        <Button variant="outline" size="xs" disabled={disabled}>
          Caption style
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Caption style</DrawerTitle>
          <DrawerDescription>Applied when captions are burned into the export.</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
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
                          color: theme.style.textColor,
                          WebkitTextStroke: `0.5px ${theme.style.outlineColor}`,
                          ...(theme.style.background
                            ? { backgroundColor: "rgba(0,0,0,0.7)", padding: "1px 6px", borderRadius: 3 }
                            : {}),
                        }}
                      >
                        Aa
                      </span>
                    </span>
                    <span className="text-foreground">{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
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

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
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
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Text color
              <input
                type="color"
                value={style.textColor}
                onChange={(e) => onChange({ ...style, textColor: e.target.value })}
                className="h-8 w-full rounded-lg border border-input bg-transparent p-0.5"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Outline color
              <input
                type="color"
                value={style.outlineColor}
                onChange={(e) => onChange({ ...style, outlineColor: e.target.value })}
                className="h-8 w-full rounded-lg border border-input bg-transparent p-0.5"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
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

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={style.background}
              onChange={(e) => onChange({ ...style, background: e.target.checked })}
              className="accent-primary"
            />
            Background box behind text
          </label>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
