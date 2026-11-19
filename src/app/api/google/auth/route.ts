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
  // force=0 lets callers opt out, but the default is force-consent so the
  // consent screen always covers every scope this app currently requests.
  // Without it, Google can skip consent for returning users and reissue a
  // token bound to their older, narrower grant, which 403s on new scopes.
  const force = new URL(req.url).searchParams.get("force") !== "0";
  return NextResponse.redirect(getAuthUrl(state, force));
}
