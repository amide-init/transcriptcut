"use client";

import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiError = { success: false; error: { code: string; message: string } };

async function postJson<T>(url: string, body: unknown): Promise<T | ApiError> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

type TranscriptionJob = {
  status: "queued" | "processing" | "completed" | "failed";
  totalChunks: number;
  completedChunks: number;
  error: string | null;
};

const POLL_INTERVAL_MS = 1500;

/**
 * XHR rather than fetch: fetch has no upload-progress events, and a
 * multi-GB podcast upload with no progress bar looks hung.
 */
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void
): Promise<{ success: true } | ApiError> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error("Invalid upload response"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/** Polls a background transcription job until it finishes, reporting chunk progress along the way. */
async function waitForTranscription(
  projectId: string,
  jobId: string,
  onProgress: (job: TranscriptionJob) => void
): Promise<TranscriptionJob> {
  for (;;) {
    const res = await fetch(`/api/projects/${projectId}/transcribe/${jobId}`);
    const data: { success: true; job: TranscriptionJob } | ApiError = await res.json();
    if (!data.success) throw new Error(data.error.message);
    onProgress(data.job);
    if (data.job.status === "completed" || data.job.status === "failed") return data.job;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export function UploadScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState("Untitled Project");
  const [uploadFraction, setUploadFraction] = useState(0);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);

  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const setStatus = useProjectStore((s) => s.setStatus);
  const setErrorState = useProjectStore((s) => s.setError);

  const handleFileSelected = async (file: File) => {
    setStatus("creating");

    const created = await postJson<{ success: true; project: { id: string } }>("/api/projects", {
      name: nameDraft || "Untitled Project",
    });
    if (!created.success) {
      setErrorState(created.error.message);
      return;
    }
    const projectId = created.project.id;

    setStatus("uploading");
    setUploadFraction(0);
    try {
      const uploaded = await uploadWithProgress(
        `/api/projects/${projectId}/upload?filename=${encodeURIComponent(file.name)}`,
        file,
        setUploadFraction
      );
      if (!uploaded.success) {
        setErrorState(uploaded.error.message);
        return;
      }
    } catch {
      setErrorState("Could not upload the video. Try again.");
      return;
    }

    setStatus("transcribing");
    setChunkProgress(null);
    try {
      const started = await postJson<{ success: true; jobId: string }>(
        `/api/projects/${projectId}/transcribe`,
        {}
      );
      if (!started.success) {
        setErrorState(started.error.message);
        return;
      }
      const job = await waitForTranscription(projectId, started.jobId, (j) =>
        setChunkProgress(j.totalChunks > 0 ? { done: j.completedChunks, total: j.totalChunks } : null)
      );
      if (job.status === "failed") {
        setErrorState("The video could not be transcribed. Please try again.");
        return;
      }
    } catch {
      setErrorState("Could not reach the transcription service. Try again.");
      return;
    }

    navigate(`/editor/${projectId}`);
  };

  const busy = status === "creating" || status === "uploading" || status === "transcribing";

  const buttonLabel =
    status === "creating"
      ? "Creating project…"
      : status === "uploading"
        ? `Uploading… ${Math.round(uploadFraction * 100)}%`
        : status === "transcribing"
          ? chunkProgress && chunkProgress.total > 1
            ? `Transcribing… ${chunkProgress.done}/${chunkProgress.total}`
            : "Transcribing…"
          : "Choose video";

  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {!busy && (
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
        )}

        <div className="space-y-1.5">
          <h1 className="text-xl font-medium">New project</h1>
          <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
            Upload a video and its transcript appears automatically. From
            there, edit the video by editing the words.
          </p>
        </div>

        <div className="space-y-3">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Project name"
            disabled={busy}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="w-full"
          >
            {buttonLabel}
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            mp4, mov, webm — long episodes welcome; transcription runs in chunks
          </p>
        )}
      </div>
    </div>
  );
}
