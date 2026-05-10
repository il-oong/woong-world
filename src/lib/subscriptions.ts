import { Redis } from "@upstash/redis";

export type SubscriptionCycle = "monthly" | "yearly";

export type Subscription = {
  id: string;
  name: string;
  /** KRW (won). For non-KRW, store the equivalent. */
  amount: number;
  /** 1-31 (day of month). For yearly, also represents the day; pair with monthOfYear. */
  paymentDay: number;
  /** 1-12. Only used for yearly. */
  monthOfYear?: number;
  cycle: SubscriptionCycle;
  /** Google Calendar event id for the recurring payment reminder, if synced. */
  calendarEventId?: string;
  createdAt: number;
};

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isSubscriptionStorageConfigured(): boolean {
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

const subKey = (email: string) => `subscription:${email.toLowerCase()}`;

export async function listSubscriptions(email: string): Promise<Subscription[]> {
  const data = await redis().get<Subscription[]>(subKey(email));
  if (!Array.isArray(data)) return [];
  return data.sort((a, b) => a.paymentDay - b.paymentDay);
}

export async function getSubscription(
  email: string,
  id: string,
): Promise<Subscription | null> {
  const all = await listSubscriptions(email);
  return all.find((s) => s.id === id) ?? null;
}

export type NewSubscriptionInput = {
  name: string;
  amount: number;
  paymentDay: number;
  monthOfYear?: number;
  cycle: SubscriptionCycle;
};

export async function addSubscription(
  email: string,
  input: NewSubscriptionInput,
): Promise<Subscription> {
  const all = await listSubscriptions(email);
  const sub: Subscription = {
    id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    amount: Math.max(0, Math.round(input.amount)),
    paymentDay: clampDay(input.paymentDay),
    monthOfYear: input.cycle === "yearly" ? clampMonth(input.monthOfYear ?? 1) : undefined,
    cycle: input.cycle,
    createdAt: Date.now(),
  };
  await redis().set(subKey(email), [...all, sub]);
  return sub;
}

export async function removeSubscription(
  email: string,
  id: string,
): Promise<Subscription | null> {
  const all = await listSubscriptions(email);
  const found = all.find((s) => s.id === id);
  if (!found) return null;
  const next = all.filter((s) => s.id !== id);
  await redis().set(subKey(email), next);
  return found;
}

export async function setCalendarEventId(
  email: string,
  id: string,
  eventId: string | undefined,
): Promise<Subscription | null> {
  const all = await listSubscriptions(email);
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], calendarEventId: eventId };
  await redis().set(subKey(email), all);
  return all[idx];
}

export function monthlyTotal(subs: Subscription[]): number {
  return subs.reduce((acc, s) => {
    if (s.cycle === "monthly") return acc + s.amount;
    return acc + Math.round(s.amount / 12);
  }, 0);
}

export function nextPaymentDate(sub: Subscription, now = new Date()): Date {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const today = now.getDate();
  if (sub.cycle === "monthly") {
    if (sub.paymentDay >= today) {
      return safeDate(y, m, sub.paymentDay);
    }
    return safeDate(y, m + 1, sub.paymentDay);
  }
  // yearly
  const targetMonth0 = (sub.monthOfYear ?? 1) - 1;
  const thisYear = safeDate(y, targetMonth0, sub.paymentDay);
  if (thisYear.getTime() >= startOfDay(now).getTime()) return thisYear;
  return safeDate(y + 1, targetMonth0, sub.paymentDay);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function safeDate(y: number, monthIdx: number, day: number): Date {
  // Handle months that don't have `day` (e.g., Feb 30 → last day of Feb).
  const lastDay = new Date(y, monthIdx + 1, 0).getDate();
  return new Date(y, monthIdx, Math.min(day, lastDay));
}

function clampDay(d: number): number {
  if (!Number.isFinite(d)) return 1;
  return Math.min(31, Math.max(1, Math.round(d)));
}

function clampMonth(m: number): number {
  if (!Number.isFinite(m)) return 1;
  return Math.min(12, Math.max(1, Math.round(m)));
}

export function formatKrw(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
