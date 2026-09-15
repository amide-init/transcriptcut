import type { Transcript } from "@/types/transcript";
import type { CutOperation } from "@/types/edit-operation";

/** Renders the transcript as timestamped segments for an LLM prompt. */
export function summarizeTranscript(transcript: Transcript): string {
  return transcript.segments
    .map((s) => `[${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.text}`)
    .join("\n");
}

/** Renders already-applied cuts so the model doesn't propose duplicates. */
export function summarizeExistingCuts(cuts: CutOperation[]): string {
  if (cuts.length === 0) return "(none yet)";
  return cuts
    .map((c) => `[${c.start.toFixed(2)}-${c.end.toFixed(2)}]${c.reason ? ` ${c.reason}` : ""}`)
    .join("\n");
}
