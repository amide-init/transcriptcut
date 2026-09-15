"use client";

import { useState } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { formatTimecode } from "@/lib/timeline/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProposedCut } from "@/agents/state";

type EditResponse =
  | { success: true; intent: string; operations: ProposedCut[] }
  | { success: false; error: { code: string; message: string } };

export function AskAI() {
  const projectId = useProjectStore((s) => s.id);
  const addCut = useTimelineStore((s) => s.addCut);

  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ intent: string; operations: ProposedCut[] } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !message.trim() || pending) return;

    setPending(true);
    setError(null);
    setProposal(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/ai/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data: EditResponse = await res.json();
      if (!data.success) {
        setError(data.error.message);
        return;
      }
      setProposal({ intent: data.intent, operations: data.operations });
      setMessage("");
    } catch {
      setError("Could not reach the AI editor. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const handleApply = () => {
    if (!proposal) return;
    for (const op of proposal.operations) {
      addCut(op.start, op.end, op.reason);
    }
    setProposal(null);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {proposal && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm">{proposal.intent}</p>
          {proposal.operations.length > 0 ? (
            <>
              <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
                {proposal.operations.map((op, i) => (
                  <li key={i}>
                    {formatTimecode(op.start)}–{formatTimecode(op.end)}
                    {op.reason ? ` — ${op.reason}` : ""}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="ghost" size="xs" onClick={() => setProposal(null)}>
                  Discard
                </Button>
                <Button variant="destructive" size="xs" onClick={handleApply}>
                  Apply {proposal.operations.length === 1 ? "1 cut" : `${proposal.operations.length} cuts`}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => setProposal(null)}>
              Dismiss
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder='Ask AI: "Remove all filler words..."'
          disabled={pending}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={pending || !message.trim()}>
          {pending ? "Thinking…" : "Ask"}
        </Button>
      </form>
    </div>
  );
}
