import { Redis } from "@upstash/redis";

// ── Types ────────────────────────────────────────────────────────────────────

export type Habit = {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
};

/** key: `"${day}-${habitId}"`, value: true = checked */
export type MonthLogs = Record<string, boolean>;

export type GoalDomain = {
  domain: string;
  goal: string;
  metric: string;
};

export type WeeklyGoal = {
  id: string;
  text: string;
  done: boolean;
  week: string; // "2026-W20" format
};

export type Goals = {
  year: number;
  keywords: string[];
  statements: { keyword: string; statement: string }[];
  domains: GoalDomain[];
  books: { title: string; category: string; source: string; memo: string }[];
  weeklyGoals?: WeeklyGoal[];
};

export type Milestone = {
  id: string;
  quarter: 1 | 2 | 3 | 4;
  label: string;
  successCriteria: string;
};

export type MonthGoal = {
  month: number; // 1–12
  detail: string;
  note: string;
};

export type Roadmap = {
  year: number;
  milestones: Milestone[];
  monthGoals: MonthGoal[];
};

export type FinanceLine = {
  id: string;
  category: "income" | "fixed" | "variable";
  label: string;
  subLabel: string;
  amount: number;
};

export type Finance = {
  year: number;
  lines: FinanceLine[];
};

// ── Redis singleton ───────────────────────────────────────────────────────────

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token)
    throw new Error("Redis credentials not configured");
  _redis = new Redis({ url, token });
  return _redis;
}

export function isStorageConfigured(): boolean {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

// ── Key helpers ───────────────────────────────────────────────────────────────

const e = (email: string) => email.toLowerCase();
const habitKey = (email: string) => `life:habits:${e(email)}`;
const logKey = (email: string, ym: string) => `life:logs:${e(email)}:${ym}`;
const goalsKey = (email: string) => `life:goals:${e(email)}`;
const roadmapKey = (email: string) => `life:roadmap:${e(email)}`;
const financeKey = (email: string) => `life:finance:${e(email)}`;

// ── Habits ────────────────────────────────────────────────────────────────────

export async function listHabits(email: string): Promise<Habit[]> {
  const data = await redis().get<Habit[]>(habitKey(email));
  return Array.isArray(data) ? data.sort((a, b) => a.order - b.order) : [];
}

export async function saveHabits(email: string, habits: Habit[]): Promise<void> {
  await redis().set(habitKey(email), habits);
}

export async function addHabit(
  email: string,
  name: string,
  color: string,
): Promise<Habit> {
  const habits = await listHabits(email);
  const habit: Habit = {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    color,
    order: habits.length,
    createdAt: Date.now(),
  };
  await saveHabits(email, [...habits, habit]);
  return habit;
}

export async function deleteHabit(email: string, id: string): Promise<boolean> {
  const habits = await listHabits(email);
  const next = habits.filter((h) => h.id !== id).map((h, i) => ({ ...h, order: i }));
  if (next.length === habits.length) return false;
  await saveHabits(email, next);
  return true;
}

export async function reorderHabits(email: string, ids: string[]): Promise<void> {
  const habits = await listHabits(email);
  const map = new Map(habits.map((h) => [h.id, h]));
  const reordered = ids.flatMap((id, i) => {
    const h = map.get(id);
    return h ? [{ ...h, order: i }] : [];
  });
  await saveHabits(email, reordered);
}

// ── Logs ──────────────────────────────────────────────────────────────────────

/** ym format: "2026-05" */
export async function getLogs(email: string, ym: string): Promise<MonthLogs> {
  const data = await redis().get<MonthLogs>(logKey(email, ym));
  return data && typeof data === "object" ? data : {};
}

export async function setLog(
  email: string,
  ym: string,
  day: number,
  habitId: string,
  checked: boolean,
): Promise<void> {
  const logs = await getLogs(email, ym);
  const key = `${day}-${habitId}`;
  if (checked) {
    logs[key] = true;
  } else {
    delete logs[key];
  }
  await redis().set(logKey(email, ym), logs);
}

// ── Stats helpers (pure) ──────────────────────────────────────────────────────

export function computeStats(
  habits: Habit[],
  logs: MonthLogs,
  daysInMonth: number,
) {
  const total = habits.length * daysInMonth;
  let checked = 0;
  const habitStats = habits.map((h) => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (logs[`${d}-${h.id}`]) count++;
    }
    checked += count;
    return { habitId: h.id, name: h.name, color: h.color, count, rate: daysInMonth > 0 ? count / daysInMonth : 0 };
  });
  const overallRate = total > 0 ? checked / total : 0;
  const topMissed = [...habitStats].sort((a, b) => a.count - b.count)[0] ?? null;

  // streak: consecutive days (from today backwards) where ALL habits are checked
  // simplified: just return per-habit streaks
  const streaks = habits.map((h) => {
    let streak = 0;
    for (let d = daysInMonth; d >= 1; d--) {
      if (logs[`${d}-${h.id}`]) streak++;
      else break;
    }
    return { habitId: h.id, streak };
  });

  return { overallRate, habitStats, topMissed, streaks };
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function getGoals(email: string): Promise<Goals | null> {
  return redis().get<Goals>(goalsKey(email));
}

export async function saveGoals(email: string, goals: Goals): Promise<void> {
  await redis().set(goalsKey(email), goals);
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

export async function getRoadmap(email: string): Promise<Roadmap | null> {
  return redis().get<Roadmap>(roadmapKey(email));
}

export async function saveRoadmap(email: string, roadmap: Roadmap): Promise<void> {
  await redis().set(roadmapKey(email), roadmap);
}

// ── Finance ───────────────────────────────────────────────────────────────────

export async function getFinance(email: string): Promise<Finance | null> {
  return redis().get<Finance>(financeKey(email));
}

export async function saveFinance(email: string, finance: Finance): Promise<void> {
  await redis().set(financeKey(email), finance);
}
