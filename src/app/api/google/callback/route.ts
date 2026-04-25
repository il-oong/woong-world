import { type NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchUserEmail } from "@/lib/google";
import {
  clearStateCookie,
  readStateCookie,
  writeSession,
} from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const expected = await readStateCookie();
  await clearStateCookie();

  const home = new URL("/calendar", url.origin);

  if (error) {
    home.searchParams.set("err", error);
    return NextResponse.redirect(home);
  }
  if (!code || !state || state !== expected) {
    home.searchParams.set("err", "invalid_state");
    return NextResponse.redirect(home);
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      home.searchParams.set("err", "no_refresh_token");
      return NextResponse.redirect(home);
    }
    const email = await fetchUserEmail(tokens.access_token);
    await writeSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      email: email ?? undefined,
    });
    home.searchParams.set("connected", "1");
    return NextResponse.redirect(home);
  } catch (e) {
    home.searchParams.set("err", e instanceof Error ? e.message : "unknown");
    return NextResponse.redirect(home);
  }
}
