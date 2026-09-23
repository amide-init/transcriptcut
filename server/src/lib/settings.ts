import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/lib/storage/local";

/**
 * Local app settings (currently just the OpenAI API key), stored as a
 * plain JSON file under DATA_DIR rather than a DB table -- this is the
 * one piece of config a user supplies through the app itself (via the
 * setup screen) rather than an env var, so it needs to survive without a
 * server restart and without touching the project schema.
 */
type Settings = {
  openaiApiKey?: string;
};

function settingsPath(): string {
  return path.join(getDataDir(), "settings.json");
}

export function readSettings(): Settings {
  const file = settingsPath();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

export function writeSettings(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

/**
 * A key entered through the setup screen (stored in settings.json) takes
 * priority over server/.env's OPENAI_API_KEY -- but local dev keeps
 * working unchanged via .env, since nothing writes settings.json unless
 * someone actually submits the setup form.
 */
export function getOpenAiApiKey(): string | undefined {
  return readSettings().openaiApiKey ?? process.env.OPENAI_API_KEY;
}
