/**
 * Model routing per claude.md section 4: GPT-4o-mini for simple/deterministic
 * editing requests, a larger model for complex/ambiguous ones. Don't route
 * everything to the larger model.
 *
 * The spec names "GPT-5.6 Luna" for the complex tier, which isn't a real,
 * callable model id. Defaulting to a real, more capable OpenAI model instead
 * and keeping it swappable via env var, so this can point at the intended
 * model the moment it actually exists/ships, with no code change.
 */
export const SIMPLE_MODEL = process.env.OPENAI_SIMPLE_MODEL ?? "gpt-4o-mini";
export const COMPLEX_MODEL = process.env.OPENAI_COMPLEX_MODEL ?? "gpt-4o";
