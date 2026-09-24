"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { usePlayerStore } from "@/stores/player-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { Button } from "@/components/ui/button";
import type { ResolvedChapter, ShowNotes } from "@/types/publishing";

type PublishingResponse =
  | { success: true; chapters: ResolvedChapter[]; youtubeChapters: string; showNotes: ShowNotes | null }
  | { success: false; error: { message: string } };

type Publishing = Omit<Extract<PublishingResponse, { success: true }>, "success">;

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Copy-to-clipboard button that briefly shows a check mark. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      disabled={!text}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
  );
}

/** Show notes as Markdown: summary, key points, and chapters -- ready to paste into a podcast host or YouTube. */
function showNotesMarkdown(notes: ShowNotes, youtubeChapters: string): string {
  const parts = [notes.summary];
  if (notes.keyPoints.length > 0) parts.push(notes.keyPoints.map((p) => `- ${p}`).join("\n"));
  if (youtubeChapters) parts.push(`Chapters:\n${youtubeChapters}`);
  return parts.join("\n\n");
}

/**
 * Podcast publishing helpers: AI chapters (editable, embedded into exported
 * MP4/MP3 and copyable as YouTube timestamps), AI show notes and title
 * ideas, and transcript downloads. AI output is text only -- it never
 * changes the edit.
 */
export function PublishPanel() {
  const projectId = useProjectStore((s) => s.id);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const operations = useTimelineStore((s) => s.operations);

  const [data, setData] = useState<Publishing | null>(null);
  const [busy, setBusy] = useState<"chapters" | "notes" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((res: PublishingResponse) => {
    if (res.success) {
      setData({ chapters: res.chapters, youtubeChapters: res.youtubeChapters, showNotes: res.showNotes });
      setError(null);
    } else {
      setError(res.error.message);
    }
  }, []);

  const request = useCallback(
    async (path: string, method: "GET" | "POST" | "PUT", body?: unknown) => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/publishing${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        apply(await res.json());
      } catch {
        setError("Could not reach the server. Try again.");
      }
    },
    [projectId, apply]
  );

  // Chapter times are placed on the edited timeline server-side, so refresh
  // whenever the edit changes.
  useEffect(() => {
    void request("", "GET");
  }, [request, operations]);

  const generate = async (kind: "chapters" | "notes") => {
    setBusy(kind);
    await request(kind === "chapters" ? "/chapters" : "/show-notes", "POST");
    setBusy(null);
  };

  const saveChapters = (chapters: { title: string; sourceStart: number }[]) =>
    request("/chapters", "PUT", { chapters: chapters.map(({ title, sourceStart }) => ({ title, sourceStart })) });

  const saveNotes = (notes: ShowNotes) => request("/show-notes", "PUT", notes);

  const chapters = data?.chapters ?? [];
  const notes = data?.showNotes ?? null;

  return (
    <div className="flex flex-col gap-5 text-xs">
      {error && <p className="text-destructive">{error}</p>}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionHeading>Chapters</SectionHeading>
          {chapters.length > 0 && <CopyButton text={data?.youtubeChapters ?? ""} label="Copy for YouTube" />}
        </div>
        <Button variant="secondary" size="sm" onClick={() => generate("chapters")} disabled={busy !== null}>
          {busy === "chapters" ? "Finding topics…" : chapters.length > 0 ? "Regenerate chapters" : "Generate chapters"}
        </Button>
        {chapters.length > 0 && (
          <ul className="flex flex-col gap-1">
            {chapters.map((chapter, i) => (
              <li key={`${chapter.sourceStart}-${chapter.title}`} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => seek(chapter.sourceStart)}
                  className="w-12 shrink-0 text-left font-mono tabular-nums text-muted-foreground hover:text-primary"
                  title="Jump to this chapter"
                >
                  {formatTime(chapter.start)}
                </button>
                <input
                  defaultValue={chapter.title}
                  maxLength={80}
                  onBlur={(e) => {
                    const title = e.target.value.trim();
                    if (title && title !== chapter.title) {
                      void saveChapters(chapters.map((c, j) => (j === i ? { ...c, title } : c)));
                    }
                  }}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void saveChapters(chapters.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove chapter"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void saveChapters([...chapters, { title: "New chapter", sourceStart: currentTime }])}
          className="inline-flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add chapter at playhead
        </button>
        <span className="text-muted-foreground">Embedded in MP4 and MP3 exports.</span>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <SectionHeading>Show notes</SectionHeading>
          {notes && <CopyButton text={showNotesMarkdown(notes, data?.youtubeChapters ?? "")} label="Copy all" />}
        </div>
        <Button variant="secondary" size="sm" onClick={() => generate("notes")} disabled={busy !== null}>
          {busy === "notes" ? "Writing…" : notes ? "Regenerate show notes" : "Generate show notes"}
        </Button>
        {notes && (
          <div key={JSON.stringify(notes)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Summary</span>
              <textarea
                defaultValue={notes.summary}
                rows={5}
                onBlur={(e) => {
                  if (e.target.value !== notes.summary) void saveNotes({ ...notes, summary: e.target.value });
                }}
                className="resize-y rounded border border-border bg-transparent p-1.5 leading-relaxed focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Key points (one per line)</span>
              <textarea
                defaultValue={notes.keyPoints.join("\n")}
                rows={Math.max(3, notes.keyPoints.length)}
                onBlur={(e) => {
                  const keyPoints = e.target.value.split("\n").map((p) => p.trim()).filter(Boolean);
                  if (keyPoints.join("\n") !== notes.keyPoints.join("\n")) void saveNotes({ ...notes, keyPoints });
                }}
                className="resize-y rounded border border-border bg-transparent p-1.5 leading-relaxed focus:border-primary focus:outline-none"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Title ideas</span>
              {notes.titles.map((title) => (
                <div key={title} className="flex items-start justify-between gap-2 rounded bg-muted px-2 py-1.5">
                  <span>{title}</span>
                  <CopyButton text={title} label="" />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {projectId && (
        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <SectionHeading>Transcript</SectionHeading>
          <div className="flex gap-3 text-muted-foreground">
            <a href={`/api/projects/${projectId}/transcript/export?format=txt`} download className="hover:text-foreground">
              Download TXT
            </a>
            <a href={`/api/projects/${projectId}/transcript/export?format=md`} download className="hover:text-foreground">
              Download Markdown
            </a>
          </div>
          <span className="text-muted-foreground">The edited episode, with speakers and timestamps.</span>
        </section>
      )}
    </div>
  );
}
