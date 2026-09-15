import type { AgentState, ProposedCut } from "@/agents/state";

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Validator Agent (claude.md section 5): deterministic, no LLM. The last
 * line of defense before an AI-proposed edit ever reaches the user for
 * review -- checks timestamp validity, bounds, and overlaps. On any
 * failure the whole plan is rejected (never a partial apply), matching
 * "AI failures must never corrupt the project" (section 23).
 */
export function validator(state: AgentState): Partial<AgentState> {
  const ops = state.operations;
  const existingCuts = state.existingCuts;

  for (const op of ops) {
    if (!Number.isFinite(op.start) || !Number.isFinite(op.end)) {
      return { error: "The AI proposed a cut with an invalid timestamp." };
    }
    if (op.start < 0) {
      return { error: "The AI proposed a cut starting before the video begins." };
    }
    if (op.end <= op.start) {
      return { error: "The AI proposed a cut where the end isn't after the start." };
    }
    if (state.duration !== null && op.end > state.duration) {
      return { error: "The AI proposed a cut extending past the end of the video." };
    }
  }

  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      if (overlaps(ops[i], ops[j])) {
        return { error: "The AI proposed two overlapping cuts." };
      }
    }
    for (const existing of existingCuts) {
      if (overlaps(ops[i], existing)) {
        return { error: "The AI proposed a cut overlapping a section that's already been cut." };
      }
    }
  }

  const validOperations: ProposedCut[] = ops;
  return { validOperations, error: null };
}
