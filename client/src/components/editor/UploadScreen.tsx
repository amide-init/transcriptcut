"use client";

import { useRef, useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Transcript } from "@/types/transcript";

type TranscribeResponse =
  | { success: true; transcript: Transcript }
  | { success: false; error: { code: string; message: string } };

export function UploadScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState("Untitled Project");

  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const setName = useProjectStore((s) => s.setName);
  const setVideoUrl = useProjectStore((s) => s.setVideoUrl);
  const setStatus = useProjectStore((s) => s.setStatus);
  const setErrorState = useProjectStore((s) => s.setError);

  const setTranscript = useTranscriptStore((s) => s.setTranscript);

  const handleFileSelected = async (file: File) => {
    setName(nameDraft || "Untitled Project");
    setVideoUrl(URL.createObjectURL(file));
    setStatus("transcribing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data: TranscribeResponse = await res.json();

      if (!data.success) {
        setErrorState(data.error.message);
        return;
      }
      setTranscript(data.transcript);
      setStatus("ready");
    } catch {
      setErrorState("Could not reach the transcription service. Try again.");
    }
  };

  const busy = status === "uploading" || status === "transcribing";

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
            {status === "transcribing"
              ? "Transcribing…"
              : status === "uploading"
                ? "Uploading…"
                : "Choose video"}
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
