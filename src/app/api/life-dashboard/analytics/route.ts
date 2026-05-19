import { NextResponse } from "next/server";
import { getValidSession } from "@/lib/google";
import { listHabits, getLogs, getFinance } from "@/lib/life-dashboard";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  return new Redis({ url, token });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export type HabitMonthStat = {
  ym: string;
  rate: number;
  checked: number;
  total: number;
};

export type RoutineDayStat = {
  date: string;
  rate: number;
  done: number;
  total: number;
};

export type TodoMonthlyStat = {
  ym: string;
  done: number;
  created: number;
};

export type FinanceSummary = {
  income: number;
  fixed: number;
  variable: number;
  subscriptionMonthly: number;
  net: number;
};

export type AnalyticsData = {
  habitMonthly: HabitMonthStat[];
  habitHeatmap: { date: string; count: number; rate: number }[];
  routineDaily: RoutineDayStat[];
  todoMonthly: TodoMonthlyStat[];
  finance: FinanceSummary | null;
};

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.email;
  const now = new Date();
  const db = redis();

  // ── 1. Habit monthly stats (12 months) ────────────────────────────────────
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const [habits, ...logResults] = await Promise.all([
    listHabits(email),
    ...months.map((ym) => getLogs(email, ym)),
  ]);

  const habitMonthly: HabitMonthStat[] = months.map((ym, i) => {
    const logs = logResults[i];
    const [y, m] = ym.split("-").map(Number);
    const days = daysInMonth(y, m);
    const total = habits.length * days;
    const checked = habits.reduce((acc, h) => {
      for (let d = 1; d <= days; d++) {
        if (logs[`${d}-${h.id}`]) acc++;
      }
      return acc;
    }, 0);
    const rate = total > 0 ? Math.round((checked / total) * 100) : 0;
    return { ym, rate, checked, total };
  });

  // ── 2. Habit heatmap (52 weeks = 364 days) ────────────────────────────────
  const heatmapDays: { date: string; count: number; rate: number }[] = [];
  const heatmapStart = new Date(now);
  heatmapStart.setDate(heatmapStart.getDate() - 363);

  // Collect unique YM values needed for heatmap
  const heatmapYms = new Set<string>();
  for (let i = 0; i < 364; i++) {
    const d = new Date(heatmapStart);
    d.setDate(d.getDate() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    heatmapYms.add(ym);
  }

  // Fetch any month not already in logResults
  const existingYmSet = new Set(months);
  const extraYms = [...heatmapYms].filter((ym) => !existingYmSet.has(ym));
  const extraLogs = await Promise.all(extraYms.map((ym) => getLogs(email, ym)));
  const logMap = new Map<string, Record<string, boolean>>();
  months.forEach((ym, i) => logMap.set(ym, logResults[i]));
  extraYms.forEach((ym, i) => logMap.set(ym, extraLogs[i]));

  for (let i = 0; i < 364; i++) {
    const d = new Date(heatmapStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const day = d.getDate();
    const logs = logMap.get(ym) ?? {};
    const count = habits.filter((h) => logs[`${day}-${h.id}`]).length;
    const rate = habits.length > 0 ? count / habits.length : 0;
    heatmapDays.push({ date: dateStr, count, rate });
  }

  // ── 3. Routine daily (last 60 days) ───────────────────────────────────────
  const routineDays: RoutineDayStat[] = [];
  try {
    const routineList = await db.get<{ id: string; name: string; weekdays?: number[] }[]>(
      `routine:${email.toLowerCase()}`,
    );
    if (Array.isArray(routineList) && routineList.length > 0) {
      for (let i = 59; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const weekday = d.getDay();
        const dateStr = d.toISOString().slice(0, 10);

        const activeRoutines = routineList.filter((r) => {
          const wd = r.weekdays;
          if (!wd || wd.length === 0) return true;
          return wd.includes(weekday);
        });

        if (activeRoutines.length === 0) continue;

        const checked = await db.smembers(`routine:check:${email.toLowerCase()}:${dateStr}`) as string[];
        const checkedSet = new Set(Array.isArray(checked) ? checked : []);
        const done = activeRoutines.filter((r) => checkedSet.has(r.id)).length;
        const rate = activeRoutines.length > 0 ? Math.round((done / activeRoutines.length) * 100) : 0;
        routineDays.push({ date: dateStr, rate, done, total: activeRoutines.length });
      }
    }
  } catch {
    // Routine data optional
  }

  // ── 4. Todo monthly stats ─────────────────────────────────────────────────
  const todoMonthly: TodoMonthlyStat[] = months.map((ym) => ({ ym, done: 0, created: 0 }));
  try {
    const todos = await db.get<{ createdAt: number; doneAt?: number; done?: boolean }[]>(
      `todos:${email.toLowerCase()}`,
    );
    if (Array.isArray(todos)) {
      todos.forEach((t) => {
        const createdYm = new Date(t.createdAt).toISOString().slice(0, 7);
        const stat = todoMonthly.find((s) => s.ym === createdYm);
        if (stat) stat.created++;
        if (t.done && t.doneAt) {
          const doneYm = new Date(t.doneAt).toISOString().slice(0, 7);
          const dStat = todoMonthly.find((s) => s.ym === doneYm);
          if (dStat) dStat.done++;
        }
      });
    }
  } catch {
    // optional
  }

  // ── 5. Finance summary ────────────────────────────────────────────────────
  let finance: FinanceSummary | null = null;
  try {
    const [financeData, subData] = await Promise.all([
      getFinance(email),
      db.get<{ amount: number; cycle: string }[]>(`subscription:${email.toLowerCase()}`),
    ]);

    if (financeData) {
      const income = financeData.lines
        .filter((l) => l.category === "income")
        .reduce((s, l) => s + l.amount, 0);
      const fixed = financeData.lines
        .filter((l) => l.category === "fixed")
        .reduce((s, l) => s + l.amount, 0);
      const variable = financeData.lines
        .filter((l) => l.category === "variable")
        .reduce((s, l) => s + l.amount, 0);

      const subscriptionMonthly = Array.isArray(subData)
        ? subData.reduce((s, sub) => {
            return s + (sub.cycle === "yearly" ? Math.round(sub.amount / 12) : sub.amount);
          }, 0)
        : 0;

      finance = {
        income,
        fixed,
        variable,
        subscriptionMonthly,
        net: income - fixed - variable - subscriptionMonthly,
      };
    }
  } catch {
    // optional
  }

  return NextResponse.json({
    habitMonthly,
    habitHeatmap: heatmapDays,
    routineDaily: routineDays,
    todoMonthly,
    finance,
  } satisfies AnalyticsData);
}
