import { z } from "zod";

/**
 * A cut the agent is proposing. Deliberately missing `id`/`createdAt` --
 * those get assigned client-side by useTimelineStore.addCut when (and if)
 * the user approves the proposal, the same way filler-word/silence removal
 * turn their own candidates into real operations. Only "cut" is supported:
 * it's the only EditOperation type the rest of the app (timeline, playback
 * skip, undo/redo) actually executes today.
 */
export const proposedCutSchema = z.object({
  type: z.literal("cut"),
  start: z.number(),
  end: z.number(),
  reason: z.string().optional(),
});
export type ProposedCut = z.infer<typeof proposedCutSchema>;

/** Structured output shape both the director and editor nodes produce. */
export const planSchema = z.object({
  complexity: z.enum(["simple", "complex"]),
  intent: z.string(),
  operations: z.array(proposedCutSchema),
});

/** LangGraph state for the Director -> Editor -> Validator pipeline (claude.md section 5). */
export const agentStateSchema = z.object({
  userRequest: z.string(),
  transcriptSummary: z.string(),
  existingCutsSummary: z.string(),
  /** Structured form of the same cuts, for the Validator's overlap checks. */
  existingCuts: z.array(z.object({ start: z.number(), end: z.number() })),
  duration: z.number().nullable(),

  complexity: z.enum(["simple", "complex"]).nullable().default(null),
  intent: z.string().nullable().default(null),
  operations: z.array(proposedCutSchema).default([]),

  validOperations: z.array(proposedCutSchema).nullable().default(null),
  error: z.string().nullable().default(null),
});
export type AgentState = z.infer<typeof agentStateSchema>;
