"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { Button } from "@/components/ui/button";
import type { ExportFormat } from "@/types/publishing";

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "mp4", label: "MP4 video" },
  { value: "mp3", label: "MP3 audio" },
  { value: "wav", label: "WAV audio" },
];

type JobStatus = "queued" | "processing" | "completed" | "failed";
type JobResponse =
  | { success: true; job: { status: JobStatus; error: string | null; downloadUrl: string | null } }
  | { success: false; error: { message: string } };

const POLL_INTERVAL_MS = 2000;

export function ExportButton() {
  const projectId = useProjectStore((s) => s.id);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const burnInCaptions = useCaptionStyleStore((s) => s.burnInCaptions);
  const captionStyle = useCaptionStyleStore((s) => s.style);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollJob = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render/${id}`);
        const data: JobResponse = await res.json();
        if (!data.success) {
          setError(data.error.message);
          setStatus("failed");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        setStatus(data.job.status);
        if (data.job.status === "completed") {
          setDownloadUrl(data.job.downloadUrl);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.job.status === "failed") {
          setError(data.job.error ?? "Render failed.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient network hiccup -- keep polling
      }
    }, POLL_INTERVAL_MS);
  };

  const handleExport = async () => {
    if (!projectId) return;
    setError(null);
    setDownloadUrl(null);
    setStatus("queued");

    try {
      const res = await fetch(`/api/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          burnInCaptions,
          captionStyle: burnInCaptions ? captionStyle : undefined,
        }),
      });
      const data: { success: true; jobId: string } | { success: false; error: { message: string } } =
        await res.json();
      if (!data.success) {
        setError(data.error.message);
        setStatus("failed");
        return;
      }
      pollJob(data.jobId);
    } catch {
      setError("Could not start the render. Please try again.");
      setStatus("failed");
    }
  };

  const busy = status === "queued" || status === "processing";

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {status === "completed" && downloadUrl ? (
        <>
          <Button asChild size="sm">
            <a href={downloadUrl} download>
              <Download className="size-3.5" />
              Download
            </a>
          </Button>
          <Button variant="ghost" size="xs" onClick={handleExport}>
            Re-export
          </Button>
        </>
      ) : (
        <>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            disabled={busy}
            aria-label="Export format"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={handleExport} disabled={busy}>
            <Upload className="size-3.5" />
            {status === "queued" ? "Queued…" : status === "processing" ? "Rendering…" : "Export"}
          </Button>
        </>
      )}
    </div>
  );
}
