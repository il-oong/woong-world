/**
 * Next.js 16 Proxy (formerly middleware.ts).
 *
 * 1. /admin/*  — require a valid __admin_session cookie (HMAC-verified).
 *               If missing/invalid/expired → redirect to /.
 * 2. /api/*    — block cross-site state-changing requests (POST/PUT/PATCH/DELETE).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/session";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOriginCheck(req: NextRequest): boolean {
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ─── /admin/* server-side gate ───────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // If SESSION_SECRET is not configured, the HMAC key is null and
    // verifySession returns null. In that case we still block access
    // in production — the only way through is a valid session.
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    const session = await verifySession(cookie);

    if (!session) {
      // In development without SESSION_SECRET, fall through so
      // local dev doesn't require the full auth stack.
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        return NextResponse.next();
      }
      // Production: redirect to home
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // ─── /api/* CSRF guard ───────────────────────────────────────────
  if (pathname.startsWith("/api") && STATE_CHANGING.has(req.method)) {
    if (!isSameOriginCheck(req)) {
      return new NextResponse(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
