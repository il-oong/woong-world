import { type NextRequest } from "next/server";
import { getEmailFromToken } from "@/lib/briefing-token";
import { getSessionFromRedis, updateSessionInRedis } from "@/lib/session-store";
import { refreshSession, listAllCalendarsEvents, listCalendars } from "@/lib/google";
import { listPlans } from "@/lib/plans";
import { getProfile } from "@/lib/secretary";
import { generateBriefingScript } from "@/lib/gemini";
import { getCalendarFilter } from "@/lib/calendar-filter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response("token required", { status: 400 });

  const email = await getEmailFromToken(token);
  if (!email) return new Response("invalid token", { status: 401 });

  let session = await getSessionFromRedis(email);
  if (!session) return new Response("not connected", { status: 401 });

  if (session.expiresAt - 60_000 <= Date.now()) {
    const refreshed = await refreshSession(session);
    if (!refreshed) return new Response("session expired", { status: 401 });
    session = refreshed;
    await updateSessionInRedis(session);
  }

  try {
    const profile = await getProfile(email);
    const name = profile?.name ?? "비서";

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayAfterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59).toISOString();

    const [calFilter, allCals, plans] = await Promise.all([
      getCalendarFilter(email),
      listCalendars(session),
      listPlans(email),
    ]);
    const calIds = calFilter
      ? calFilter.filter((id) => allCals.some((c) => c.id === id))
      : allCals.map((c) => c.id);
    const events = await listAllCalendarsEvents(session, todayStart, dayAfterEnd, calIds);

    const script = await generateBriefingScript(name, events, plans);
    return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "error", { status: 500 });
  }
}
