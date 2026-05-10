import { Redis } from "@upstash/redis";

export type Routine = {
  id: string;
  name: string;
  /** Order index for display. Lower = top. */
  order: number;
  createdAt: number;
};

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

export async function addRoutine(email: string, name: string): Promise<Routine> {
  const all = await listRoutines(email);
  const routine: Routine = {
    id: `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    order: all.length > 0 ? Math.max(...all.map((r) => r.order)) + 1 : 0,
    createdAt: Date.now(),
  };
  await redis().set(listKey(email), [...all, routine]);
  return routine;
}

export async function renameRoutine(
  email: string,
  id: string,
  name: string,
): Promise<Routine | null> {
  const all = await listRoutines(email);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], name };
  await redis().set(listKey(email), all);
  return all[idx];
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
  totalRoutines: number,
): Promise<WeeklyStat[]> {
  const out: WeeklyStat[] = [];
  const [y, m, d] = todayIso.split("-").map(Number);
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const checks = await getChecks(email, iso);
    out.push({
      date: iso,
      weekday: WEEKDAYS[dt.getDay()],
      completed: checks.length,
      total: totalRoutines,
    });
  }
  return out;
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
