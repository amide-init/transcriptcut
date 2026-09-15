"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

export function UploadScreen() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState("Untitled Project");

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
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: formData,
      });
      const uploaded: { success: true } | ApiError = await uploadRes.json();
      if (!uploaded.success) {
        setErrorState(uploaded.error.message);
        return;
      }
    } catch {
      setErrorState("Could not upload the video. Try again.");
      return;
    }

    setStatus("transcribing");
    try {
      const transcribeRes = await fetch(`/api/projects/${projectId}/transcribe`, { method: "POST" });
      const transcribed: { success: true } | ApiError = await transcribeRes.json();
      if (!transcribed.success) {
        setErrorState(transcribed.error.message);
        return;
      }
    } catch {
      setErrorState("Could not reach the transcription service. Try again.");
      return;
    }

    router.push(`/editor/${projectId}`);
  };

  const busy = status === "creating" || status === "uploading" || status === "transcribing";

  const buttonLabel =
    status === "creating"
      ? "Creating project…"
      : status === "uploading"
        ? "Uploading…"
        : status === "transcribing"
          ? "Transcribing…"
          : "Choose video";

  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
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
            mp4, mov, webm, m4a — up to 25MB for now
          </p>
        )}
      </div>
    </div>
  );
}
