import { Hono } from "hono";
import OpenAI from "openai";
import { getOpenAiApiKey, writeSettings } from "@/lib/settings";
import { errorResponse } from "@/lib/http";

export const settingsRoute = new Hono();

// Never returns the key itself -- only whether one is configured. Checks
// the same source getOpenAiApiKey() does (settings.json, falling back to
// server/.env's OPENAI_API_KEY) -- not just settings.json alone -- so
// local dev (where the key lives in .env, and no one has ever hit the
// setup screen) correctly reports "configured" instead of being wrongly
// redirected to setup.
settingsRoute.get("/", async (c) => {
  return c.json({ success: true, hasApiKey: Boolean(getOpenAiApiKey()) });
});

settingsRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const key = body?.openaiApiKey;
  if (typeof key !== "string" || !key.trim()) {
    return errorResponse(c, "INVALID_KEY", "Enter an OpenAI API key.", 400);
  }

  // Validate against the real API before persisting -- a typo'd key
  // should fail here, immediately and clearly, not surface later as an
  // opaque transcription failure with no indication it's a key problem.
  try {
    await new OpenAI({ apiKey: key }).models.list();
  } catch {
    return errorResponse(
      c,
      "INVALID_KEY",
      "That key doesn't seem to work. Double-check it and try again.",
      400
    );
  }

  writeSettings({ openaiApiKey: key });
  return c.json({ success: true });
});
