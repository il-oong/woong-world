import { Redis } from "@upstash/redis";

export type Routine = {
  id: string;
  name: string;
  /** Order index for display. Lower = top. */
  order: number;
  createdAt: number;
  /**
   * Active weekdays (0=Sun, 1=Mon, ..., 6=Sat). Empty or undefined = every day.
   * Stored as plain numbers so legacy records (no field) implicitly mean "daily".
   */
  weekdays?: number[];
};

/** True if the routine is active on the given JS getDay() value. */
export function isRoutineActiveOn(routine: Routine, weekday: number): boolean {
  if (!routine.weekdays || routine.weekdays.length === 0) return true;
  return routine.weekdays.includes(weekday);
}

function normalizeWeekdays(input: unknown): number[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const cleaned = Array.from(
    new Set(
      input
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
    ),
  ).sort((a, b) => a - b);
  // 7개 모두 선택했거나 비었으면 "매일"로 보고 필드를 비워둔다.
  if (cleaned.length === 0 || cleaned.length === 7) return undefined;
  return cleaned;
}

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isRoutineStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis credentials not set");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

const listKey = (email: string) => `routine:${email.toLowerCase()}`;
const checkKey = (email: string, dateIso: string) =>
  `routine:check:${email.toLowerCase()}:${dateIso}`;

export async function listRoutines(email: string): Promise<Routine[]> {
  const data = await redis().get<Routine[]>(listKey(email));
  if (!Array.isArray(data)) return [];
  return data.sort((a, b) => a.order - b.order);
}

export async function addRoutine(
  email: string,
  name: string,
  weekdaysInput?: unknown,
): Promise<Routine> {
  const all = await listRoutines(email);
  const weekdays = normalizeWeekdays(weekdaysInput);
  const routine: Routine = {
    id: `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    order: all.length > 0 ? Math.max(...all.map((r) => r.order)) + 1 : 0,
    createdAt: Date.now(),
    ...(weekdays ? { weekdays } : {}),
  };
  await redis().set(listKey(email), [...all, routine]);
  return routine;
}

export async function updateRoutine(
  email: string,
  id: string,
  patch: { name?: string; weekdays?: unknown },
): Promise<Routine | null> {
  const all = await listRoutines(email);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next: Routine = { ...all[idx] };
  if (typeof patch.name === "string") next.name = patch.name;
  if (patch.weekdays !== undefined) {
    const weekdays = normalizeWeekdays(patch.weekdays);
    if (weekdays) next.weekdays = weekdays;
    else delete next.weekdays;
  }
  all[idx] = next;
  await redis().set(listKey(email), all);
  return next;
}

export async function removeRoutine(email: string, id: string): Promise<boolean> {
  const all = await listRoutines(email);
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  await redis().set(listKey(email), next);
  return true;
}

export async function getChecks(email: string, dateIso: string): Promise<string[]> {
  const data = await redis().get<string[]>(checkKey(email, dateIso));
  return Array.isArray(data) ? data : [];
}

/** Toggle a routine's check state for a given date. Returns new state. */
export async function toggleCheck(
  email: string,
  routineId: string,
  dateIso: string,
): Promise<{ checked: boolean; checkedIds: string[] }> {
  const current = await getChecks(email, dateIso);
  const has = current.includes(routineId);
  const next = has
    ? current.filter((x) => x !== routineId)
    : [...current, routineId];
  await redis().set(checkKey(email, dateIso), next);
  return { checked: !has, checkedIds: next };
}

export type WeeklyStat = {
  date: string;        // YYYY-MM-DD
  weekday: string;     // 월/화/수...
  completed: number;
  total: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export async function weeklyStats(
  email: string,
  todayIso: string,
  routines: Routine[],
): Promise<WeeklyStat[]> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const days = Array.from({ length: 7 }, (_, idx) => {
    const dt = new Date(y, m - 1, d - (6 - idx));
    return dt;
  });
  return collectDailyStats(email, days, routines);
}

export type MonthStat = {
  date: string;
  day: number;          // 1..31
  weekday: number;      // 0=Sun .. 6=Sat (JS getDay)
  completed: number;
  total: number;
  isFuture: boolean;
};

export type MonthlyStats = {
  year: number;
  month: number;        // 1..12
  daysInMonth: number;
  firstWeekday: number; // weekday (0=Sun) of day 1
  days: MonthStat[];
};

export async function monthlyStats(
  email: string,
  todayIso: string,
  routines: Routine[],
): Promise<MonthlyStats> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const allDates = Array.from(
    { length: daysInMonth },
    (_, i) => new Date(y, m - 1, i + 1),
  );
  const stats = await collectDailyStats(email, allDates, routines);
  const days: MonthStat[] = stats.map((s, i) => ({
    date: s.date,
    day: i + 1,
    weekday: allDates[i].getDay(),
    completed: s.completed,
    total: s.total,
    isFuture: i + 1 > d,
  }));
  return {
    year: y,
    month: m,
    daysInMonth,
    firstWeekday: first.getDay(),
    days,
  };
}

async function collectDailyStats(
  email: string,
  dates: Date[],
  routines: Routine[],
): Promise<WeeklyStat[]> {
  const isoList = dates.map(
    (dt) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
  );
  // 병렬 조회로 N개 날짜를 한 라운드트립처럼 처리.
  const allChecks = await Promise.all(isoList.map((iso) => getChecks(email, iso)));
  return dates.map((dt, idx) => {
    const activeIds = new Set(
      routines.filter((r) => isRoutineActiveOn(r, dt.getDay())).map((r) => r.id),
    );
    const completed = allChecks[idx].filter((id) => activeIds.has(id)).length;
    return {
      date: isoList[idx],
      weekday: WEEKDAYS[dt.getDay()],
      completed,
      total: activeIds.size,
    };
  });
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
