import { type NextRequest } from "next/server";
import { getEmailFromToken } from "@/lib/briefing-token";
import { getSessionFromRedis, updateSessionInRedis } from "@/lib/session-store";
import { refreshSession, listAllCalendarsEvents, listCalendars } from "@/lib/google";
import { listPlans } from "@/lib/plans";
import { getProfile } from "@/lib/secretary";
import { generateBriefingScript, getBriefingMode, type BriefingPerformance } from "@/lib/gemini";
import { getCalendarFilter } from "@/lib/calendar-filter";
import { listHabits, getLogs } from "@/lib/life-dashboard";
import { listHoldings, listWatchlist, listEvents } from "@/lib/alpha";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

async function collectPerformance(email: string): Promise<BriefingPerformance> {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const ym = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const dateStr = (d: Date) => d.toISOString().slice(0, 10);

  const perf: BriefingPerformance = {
    yesterdayHabitRate: null,
    yesterdayHabitChecked: null,
    yesterdayHabitTotal: null,
    weekHabitRate: null,
    weekRoutineRate: null,
    openTodos: null,
    doneTodosToday: null,
    portfolioAlerts: null,
    watchlistItems: null,
    upcomingEconEvents: null,
  };

  try {
    const [habits, yesterdayLogs] = await Promise.all([
      listHabits(email),
      getLogs(email, ym(yesterday)),
    ]);

    if (habits.length > 0) {
      const yDay = yesterday.getDate();
      const checked = habits.filter((h) => yesterdayLogs[`${yDay}-${h.id}`]).length;
      perf.yesterdayHabitChecked = checked;
      perf.yesterdayHabitTotal = habits.length;
      perf.yesterdayHabitRate = Math.round((checked / habits.length) * 100);

      // This week (last 7 days)
      const weekLogs = await Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          return getLogs(email, ym(d)).then((logs) => ({ d, logs }));
        }),
      );
      let weekChecked = 0;
      let weekTotal = 0;
      for (const { d, logs } of weekLogs) {
        const day = d.getDate();
        weekChecked += habits.filter((h) => logs[`${day}-${h.id}`]).length;
        weekTotal += habits.length;
      }
      if (weekTotal > 0) {
        perf.weekHabitRate = Math.round((weekChecked / weekTotal) * 100);
      }
    }
  } catch {
    // optional
  }

  try {
    const db = getRedis();
    const emailLc = email.toLowerCase();

    // Routine: this week
    const routineList = await db.get<{ id: string; weekdays?: number[] }[]>(`routine:${emailLc}`);
    if (Array.isArray(routineList) && routineList.length > 0) {
      let rDone = 0;
      let rTotal = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const weekday = d.getDay();
        const active = routineList.filter((r) => {
          const wd = r.weekdays;
          if (!wd || wd.length === 0) return true;
          return wd.includes(weekday);
        });
        if (active.length === 0) continue;
        const checked = (await db.smembers(`routine:check:${emailLc}:${dateStr(d)}`)) as string[];
        const checkedSet = new Set(Array.isArray(checked) ? checked : []);
        rDone += active.filter((r) => checkedSet.has(r.id)).length;
        rTotal += active.length;
      }
      if (rTotal > 0) {
        perf.weekRoutineRate = Math.round((rDone / rTotal) * 100);
      }
    }

    // Todos
    const todos = await db.get<{ done: boolean; doneAt?: number; createdAt: number }[]>(
      `todos:${emailLc}`,
    );
    if (Array.isArray(todos)) {
      perf.openTodos = todos.filter((t) => !t.done).length;
      const todayStr = dateStr(now);
      perf.doneTodosToday = todos.filter((t) => {
        if (!t.done || !t.doneAt) return false;
        return new Date(t.doneAt).toISOString().slice(0, 10) === todayStr;
      }).length;
    }
  } catch {
    // optional
  }

  try {
    const [holdings, watchlist, econEvents] = await Promise.all([
      listHoldings(email),
      listWatchlist(email),
      listEvents(email),
    ]);

    // Portfolio sell signals: holdings near stop-loss or target
    const alerts: { name: string; ticker: string; alertType: string; message: string }[] = [];
    for (const h of holdings) {
      if (h.stopLoss > 0) {
        alerts.push({
          name: h.name,
          ticker: h.ticker,
          alertType: "손절 기준 보유",
          message: `손절가 ${h.stopLoss.toLocaleString()} 설정됨 — 매수가 ${h.avgBuyPrice.toLocaleString()}`,
        });
      }
      if (h.target1 > 0) {
        alerts.push({
          name: h.name,
          ticker: h.ticker,
          alertType: "목표가 설정",
          message: `1차 목표 ${h.target1.toLocaleString()}${h.target2 > 0 ? `, 2차 ${h.target2.toLocaleString()}` : ""}`,
        });
      }
    }
    if (alerts.length > 0) perf.portfolioAlerts = alerts.slice(0, 6);

    // Watchlist
    if (watchlist.length > 0) {
      perf.watchlistItems = watchlist.slice(0, 5).map((w) => ({
        name: w.name,
        ticker: w.ticker,
        memo: w.memo,
      }));
    }

    // Upcoming economic events (next 7 days)
    const todayDate = now.toISOString().slice(0, 10);
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const upcoming = econEvents
      .filter((e) => e.eventDate >= todayDate && e.eventDate <= sevenDaysLater.toISOString().slice(0, 10))
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .slice(0, 5)
      .map((e) => {
        const diffMs = new Date(e.eventDate).getTime() - new Date(todayDate).getTime();
        const daysLeft = Math.round(diffMs / 86400000);
        return { title: e.title, eventDate: e.eventDate, importance: e.importance, daysLeft };
      });
    if (upcoming.length > 0) perf.upcomingEconEvents = upcoming;
  } catch {
    // optional
  }

  return perf;
}

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
    const mode = getBriefingMode(now);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const rangeEnd =
      mode === "monthly"
        ? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
        : mode === "weekly"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString()
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59).toISOString();

    const [calFilter, allCals, plans, performance] = await Promise.all([
      getCalendarFilter(email),
      listCalendars(session),
      listPlans(email),
      collectPerformance(email),
    ]);

    const calIds = calFilter
      ? calFilter.filter((id) => allCals.some((c) => c.id === id))
      : allCals.map((c) => c.id);
    const events = await listAllCalendarsEvents(session, todayStart, rangeEnd, calIds);

    const script = await generateBriefingScript(name, events, plans, mode, performance);
    return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "error", { status: 500 });
  }
}
