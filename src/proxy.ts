/**
 * Next.js 16 Proxy (formerly `middleware.ts`).
 *
 * Responsibilities, in order:
 *   1. Cheap same-origin guard for state-changing /api/* requests. This is a
 *      belt-and-braces duplicate of the per-route `isSameOrigin` check so
 *      cross-site POSTs are rejected before route handler code runs.
 *   2. Nothing else — auth for /admin/* is still done in the layout because
 *      real verification requires firebase-admin, which isn't wired up yet.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function proxy(req: NextRequest) {
  if (STATE_CHANGING.has(req.method) && !isSameOrigin(req)) {
    return new NextResponse(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
