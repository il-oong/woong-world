import { clearSession, readSession } from "@/lib/session";
import { removeSessionFromRedis } from "@/lib/session-store";
import { revokeToken } from "@/lib/briefing-token";

export async function POST() {
  const session = await readSession();
  if (session?.email) {
    await removeSessionFromRedis(session.email).catch(() => {});
    await revokeToken(session.email).catch(() => {});
  }
  await clearSession();
  return Response.json({ ok: true });
}
