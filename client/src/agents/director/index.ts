import { SIMPLE_MODEL } from "@/lib/ai/models";
import { planWithModel } from "@/agents/plan-with-model";
import type { AgentState } from "@/agents/state";

/**
 * Director Agent (claude.md section 5): understands the user's request and,
 * for simple/deterministic cases, drafts the operations itself using the
 * cheap model -- this is the "GPT-4o-mini handles it directly" branch of
 * the routing diagram in section 4. If it judges the request complex or
 * ambiguous, the Editor Agent takes over with the larger model.
 */
export async function director(state: AgentState): Promise<Partial<AgentState>> {
  const plan = await planWithModel(SIMPLE_MODEL, {
    userRequest: state.userRequest,
    transcriptSummary: state.transcriptSummary,
    existingCutsSummary: state.existingCutsSummary,
    duration: state.duration,
  });

  return {
    complexity: plan.complexity,
    intent: plan.intent,
    operations: plan.operations,
  };
}
