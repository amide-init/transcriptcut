import { StateGraph, START, END } from "@langchain/langgraph";
import { agentStateSchema, type ProposedCut } from "@/agents/state";
import { director } from "@/agents/director";
import { editor } from "@/agents/editor";
import { validator } from "@/agents/validator";
import { summarizeExistingCuts, summarizeTranscript } from "@/agents/context";
import type { Transcript } from "@/types/transcript";
import type { CutOperation } from "@/types/edit-operation";

const graph = new StateGraph(agentStateSchema)
  .addNode("director", director)
  .addNode("editor", editor)
  .addNode("validator", validator)
  .addEdge(START, "director")
  .addConditionalEdges("director", (state) => (state.complexity === "complex" ? "editor" : "validator"))
  .addEdge("editor", "validator")
  .addEdge("validator", END)
  .compile();

export type EditAgentResult =
  | { success: true; intent: string; operations: ProposedCut[] }
  | { success: false; error: string };

/** Runs the Director -> (Editor) -> Validator pipeline for one natural-language edit request. */
export async function runEditAgent(args: {
  userRequest: string;
  transcript: Transcript;
  duration: number | null;
  existingCuts: CutOperation[];
}): Promise<EditAgentResult> {
  const result = await graph.invoke({
    userRequest: args.userRequest,
    transcriptSummary: summarizeTranscript(args.transcript),
    existingCutsSummary: summarizeExistingCuts(args.existingCuts),
    existingCuts: args.existingCuts.map((c) => ({ start: c.start, end: c.end })),
    duration: args.duration,
  });

  if (result.error || !result.validOperations) {
    return { success: false, error: result.error ?? "The AI could not produce a valid edit plan." };
  }

  return { success: true, intent: result.intent ?? "", operations: result.validOperations };
}
