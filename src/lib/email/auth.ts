import type { NextRequest } from "next/server";

// Shared-secret auth for endpoints called by Apps Script.
// Apps Script sends: Authorization: Bearer <APPS_SCRIPT_SHARED_SECRET>

export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.APPS_SCRIPT_SHARED_SECRET;
  if (!secret) {
    console.error("[Auth] APPS_SCRIPT_SHARED_SECRET not set — rejecting");
    return false;
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Constant-time-ish compare: lengths first, then value.
  return token.length === secret.length && token === secret;
}
