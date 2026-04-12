import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminEmail } from "@/lib/firebase-admin";
import { createSessionCookie, COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { isSameOrigin, sanitizeError } from "@/lib/api-guard";

/**
 * POST /api/auth/session
 *
 * Body: { idToken: string }
 *
 * Flow:
 *   1. Verify the Firebase ID token with firebase-admin
 *   2. Check that the email is the authorized admin
 *   3. Create a signed session cookie (HMAC-SHA256)
 *   4. Set it as httpOnly / secure / sameSite=lax
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { idToken } = (await req.json()) as { idToken?: string };
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "idToken required" }, { status: 400 });
    }

    // 1. Verify with Firebase Admin
    const decoded = await verifyIdToken(idToken);
    if (!decoded?.email) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }

    // 2. Admin check
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // 3. Create session cookie
    const cookie = await createSessionCookie(decoded.email);
    if (!cookie) {
      // SESSION_SECRET not set — can't create server-side sessions
      return NextResponse.json({ error: "server sessions not configured" }, { status: 503 });
    }

    // 4. Set cookie
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("session create error:", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/session — clear the session cookie (sign out).
 */
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
