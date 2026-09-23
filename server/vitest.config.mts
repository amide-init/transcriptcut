import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // lib/ai/filler-words.ts constructs its OpenAI client at module load
      // time, which throws without a key -- this dummy value only needs to
      // exist, never a real one, since the tests that import it only
      // exercise the deterministic path that returns before any API call.
      OPENAI_API_KEY: "test-key-not-used",
    },
  },
});
