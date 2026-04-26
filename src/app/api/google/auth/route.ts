import { NextResponse, type NextRequest } from "next/server";
import { getAuthUrl, isConfigured } from "@/lib/google";
import { setStateCookie } from "@/lib/session";

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/calendar?err=not_configured", process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000"),
    );
  }
  const state = crypto.randomUUID();
  await setStateCookie(state);
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.redirect(getAuthUrl(state, force));
}
