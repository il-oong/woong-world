import { clearSession, readSession } from "@/lib/session";
import { removeSessionFromRedis } from "@/lib/session-store";
import { revokeToken } from "@/lib/briefing-token";

async function revokeGoogleGrant(token: string): Promise<void> {
  // Revoking on Google's side drops the stored OAuth grant too, so the next
  // sign-in presents a fresh consent screen that includes every scope this
  // app currently asks for. Without this, Google can skip consent and reissue
  // a token still bound to the user's older, narrower grant (the symptom is
  // 403 from a scope that was added after the user first authorized).
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
  } catch {
    // Best-effort; the local session clear below still logs the user out.
  }
}

export async function POST() {
  const session = await readSession();
  if (session?.email) {
    await removeSessionFromRedis(session.email).catch(() => {});
    await revokeToken(session.email).catch(() => {});
  }
  // Revoke whichever token is still live — refresh preferred because revoking
  // it also invalidates every access token issued from it.
  if (session?.refreshToken) {
    await revokeGoogleGrant(session.refreshToken);
  } else if (session?.accessToken) {
    await revokeGoogleGrant(session.accessToken);
  }
  await clearSession();
  return Response.json({ ok: true });
}
