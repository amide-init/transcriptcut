"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useCaptionStyleStore } from "@/stores/caption-style-store";
import { Button } from "@/components/ui/button";

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
              Download
            </a>
          </Button>
          <Button variant="ghost" size="xs" onClick={handleExport}>
            Re-export
          </Button>
        </>
      ) : (
        <Button size="sm" onClick={handleExport} disabled={busy}>
          {status === "queued" ? "Queued…" : status === "processing" ? "Rendering…" : "Export"}
        </Button>
      )}
    </div>
  );
}
