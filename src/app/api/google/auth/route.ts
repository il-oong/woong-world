import { NextResponse } from "next/server";
import { getAuthUrl, isConfigured } from "@/lib/google";
import { setStateCookie } from "@/lib/session";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/calendar?err=not_configured", process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000"),
    );
  }
  const state = crypto.randomUUID();
  await setStateCookie(state);
  return NextResponse.redirect(getAuthUrl(state));
}
