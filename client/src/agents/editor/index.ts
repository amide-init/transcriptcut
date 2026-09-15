import { COMPLEX_MODEL } from "@/lib/ai/models";
import { planWithModel } from "@/agents/plan-with-model";
import type { AgentState } from "@/agents/state";

/**
 * Editor Agent (claude.md section 5): converts intent into structured
 * operations for requests the Director judged complex/ambiguous, using the
 * larger model for the deeper reasoning those need. Only runs when
 * complexity === "complex" -- see graph.ts's conditional edge -- so simple
 * requests never pay for the bigger model, per section 4's explicit "don't
 * route everything to the larger model."
 */
export async function editor(state: AgentState): Promise<Partial<AgentState>> {
  const plan = await planWithModel(COMPLEX_MODEL, {
    userRequest: state.userRequest,
    transcriptSummary: state.transcriptSummary,
    existingCutsSummary: state.existingCutsSummary,
    duration: state.duration,
  });

  return {
    intent: plan.intent,
    operations: plan.operations,
  };
}
