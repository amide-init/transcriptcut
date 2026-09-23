import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function errorResponse(c: Context, code: string, message: string, status: ContentfulStatusCode) {
  return c.json({ success: false, error: { code, message } }, status);
}
