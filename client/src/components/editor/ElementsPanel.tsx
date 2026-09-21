"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { LOGO_POSITIONS, type LogoPosition } from "@/lib/video/logo";
import { Button } from "@/components/ui/button";

const POSITION_LABELS: Record<LogoPosition, string> = {
  "top-left": "Top Left",
  "top-right": "Top Right",
  "bottom-left": "Bottom Left",
  "bottom-right": "Bottom Right",
};

export function ElementsPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectId = useProjectStore((s) => s.id);
  const logoUrl = useProjectStore((s) => s.logoUrl);
  const logoPosition = useProjectStore((s) => s.logoPosition);
  const logoPaddingX = useProjectStore((s) => s.logoPaddingX);
  const logoPaddingY = useProjectStore((s) => s.logoPaddingY);
  const logoOpacity = useProjectStore((s) => s.logoOpacity);
  const setLogoUrl = useProjectStore((s) => s.setLogoUrl);
  const setLogoPosition = useProjectStore((s) => s.setLogoPosition);
  const setLogoPadding = useProjectStore((s) => s.setLogoPadding);
  const setLogoOpacity = useProjectStore((s) => s.setLogoOpacity);

  const handleFileSelected = async (file: File) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/logo`, { method: "POST", body: formData });
      const data: { success: true; logoUrl: string } | { success: false; error: { message: string } } =
        await res.json();
      if (!data.success) {
        setError(data.error.message);
        return;
      }
      // Bust any cached image at the same URL from a previous upload.
      setLogoUrl(`${data.logoUrl}?t=${Date.now()}`);
    } catch {
      setError("Could not upload the logo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/logo`, { method: "DELETE" });
      const data: { success: true } | { success: false; error: { message: string } } = await res.json();
      if (!data.success) {
        setError(data.error.message);
        return;
      }
      setLogoUrl(null);
    } catch {
      setError("Could not remove the logo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="flex flex-col gap-2">
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">Logo</span>

        {logoUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- served from local storage, not a static asset Next can optimize */}
              <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              onClick={handleRemove}
              disabled={busy}
              className="ml-auto"
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || !projectId}
        >
          {busy ? "Working…" : logoUrl ? "Replace logo" : "Upload logo"}
        </Button>

        {error && <p className="text-destructive">{error}</p>}
      </div>

      {logoUrl && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              Position
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {LOGO_POSITIONS.map((position) => (
                <Button
                  key={position}
                  type="button"
                  size="xs"
                  variant={logoPosition === position ? "default" : "outline"}
                  onClick={() => setLogoPosition(position)}
                >
                  {POSITION_LABELS[position]}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              Padding
            </span>
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-foreground">
                <span>Padding X</span>
                <span className="font-mono tabular-nums text-muted-foreground">{logoPaddingX}</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={logoPaddingX}
                onChange={(e) => setLogoPadding(Number(e.target.value), logoPaddingY)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-foreground">
                <span>Padding Y</span>
                <span className="font-mono tabular-nums text-muted-foreground">{logoPaddingY}</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={logoPaddingY}
                onChange={(e) => setLogoPadding(logoPaddingX, Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              Opacity
            </span>
            <label className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-foreground">
                <span>Opacity</span>
                <span className="font-mono tabular-nums text-muted-foreground">{logoOpacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={logoOpacity}
                onChange={(e) => setLogoOpacity(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
