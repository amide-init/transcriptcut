/**
 * Minimal shared logging template so every server log line -- request
 * logging, startup, and error logs -- looks the same in the terminal
 * instead of each call site inventing its own ad-hoc console.log format.
 * `[HH:MM:SS] LEVEL  message`, level padded to line up in a column.
 */

type Level = "INFO" | "WARN" | "ERROR";

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

function write(level: Level, message: string, ...args: unknown[]): void {
  const line = `[${timestamp()}] ${level.padEnd(5)} ${message}`;
  const out = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  out(line, ...args);
}

export const logger = {
  info: (message: string, ...args: unknown[]) => write("INFO", message, ...args),
  warn: (message: string, ...args: unknown[]) => write("WARN", message, ...args),
  error: (message: string, ...args: unknown[]) => write("ERROR", message, ...args),
  /** Raw line writer, for handing to Hono's `logger()` request middleware so its output matches this same template. */
  raw: (line: string) => write("INFO", line),
};
