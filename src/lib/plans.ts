import { Redis } from "@upstash/redis";
import type { CategoryId } from "./categories";

export type PlanPeriod = "weekly" | "monthly" | "yearly";

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Plan = {
  id: string;
  period: PlanPeriod;
  /**
   * Period identifier:
   *   weekly  → "2026-W17" (ISO week)
   *   monthly → "2026-04"
   *   yearly  → "2026"
   */
  periodKey: string;
  /** Optional category. null = cross-category */
  categoryId: CategoryId | null;
  title: string;
  items: PlanItem[];
  notes: string;
  createdAt: number;
  updatedAt: number;
};

export type NewPlanInput = {
  period: PlanPeriod;
  periodKey: string;
  categoryId: CategoryId | null;
  title: string;
  items?: { text: string; done?: boolean }[];
  notes?: string;
};

export type UpdatePlanInput = Partial<{
  title: string;
  categoryId: CategoryId | null;
  items: PlanItem[];
  notes: string;
}>;

function getRedisCreds(): { url: string; token: string } | null {
  // Vercel Marketplace injects Upstash credentials as KV_REST_API_* by default,
  // but direct Upstash signup uses UPSTASH_REDIS_REST_*. Accept either.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) {
    throw new Error(
      "Redis credentials not set (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN)",
    );
  }
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

function userKey(email: string): string {
  return `plans:${email.toLowerCase()}`;
}

export async function listPlans(email: string): Promise<Plan[]> {
  const data = await redis().get<Plan[]>(userKey(email));
  return Array.isArray(data) ? data : [];
}

export async function getPlan(email: string, id: string): Promise<Plan | null> {
  const all = await listPlans(email);
  return all.find((p) => p.id === id) ?? null;
}

async function savePlans(email: string, plans: Plan[]): Promise<void> {
  await redis().set(userKey(email), plans);
}

export async function createPlan(
  email: string,
  input: NewPlanInput,
): Promise<Plan> {
  const now = Date.now();
  const plan: Plan = {
    id: `pl_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    period: input.period,
    periodKey: input.periodKey,
    categoryId: input.categoryId,
    title: input.title,
    items: (input.items ?? []).map((it) => ({
      id: `it_${Math.random().toString(36).slice(2, 10)}`,
      text: it.text,
      done: it.done ?? false,
    })),
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
  const all = await listPlans(email);
  all.unshift(plan);
  await savePlans(email, all);
  return plan;
}

export async function updatePlan(
  email: string,
  id: string,
  patch: UpdatePlanInput,
): Promise<Plan | null> {
  const all = await listPlans(email);
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const next: Plan = {
    ...all[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  all[idx] = next;
  await savePlans(email, all);
  return next;
}

export async function deletePlan(email: string, id: string): Promise<boolean> {
  const all = await listPlans(email);
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  await savePlans(email, next);
  return true;
}

export function currentPeriodKey(period: PlanPeriod, date = new Date()): string {
  if (period === "yearly") return String(date.getFullYear());
  if (period === "monthly") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return isoWeekKey(date);
}

export function isoWeekKey(date: Date): string {
  // ISO 8601 week-numbering year/week
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
