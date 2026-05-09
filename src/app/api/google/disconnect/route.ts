import { clearSession, readSession } from "@/lib/session";
import { removeSessionFromRedis } from "@/lib/session-store";

export async function POST() {
  const session = await readSession();
  if (session?.email) {
    await removeSessionFromRedis(session.email).catch(() => {});
  }
  await clearSession();
  return Response.json({ ok: true });
}
