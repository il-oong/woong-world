import { Redis } from "@upstash/redis";
import { getValidSession } from "./google";
import { type GoogleSession } from "./session";

const ADMINS_KEY = "admins:list";

let _redis: Redis | null = null;
function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

/** Super admin set by ADMIN_EMAIL env var; always admin, can't be removed. */
export function getSuperAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
}

/** Back-compat alias. */
export function getAdminEmail(): string {
  return getSuperAdminEmail();
}

async function readExtras(): Promise<string[]> {
  const r = redis();
  if (!r) return [];
  try {
    const raw = await r.get<string[]>(ADMINS_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => String(e).toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function listAdmins(): Promise<{ super: string; extras: string[] }> {
  const superE = getSuperAdminEmail();
  const extras = (await readExtras()).filter((e) => e !== superE);
  return { super: superE, extras };
}

export async function isAdminEmail(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase();
  const superE = getSuperAdminEmail();
  if (superE && e === superE) return true;
  const extras = await readExtras();
  return extras.includes(e);
}

export async function isAdminSession(): Promise<boolean> {
  const s = await getValidSession();
  return isAdminEmail(s?.email ?? null);
}

export async function getAdminSession(): Promise<GoogleSession | null> {
  const s = await getValidSession();
  if (!s || !(await isAdminEmail(s.email))) return null;
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addAdmin(email: string): Promise<void> {
  const e = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error("invalid_email");
  if (e === getSuperAdminEmail()) return; // already super
  const r = redis();
  if (!r) throw new Error("storage_not_configured");
  const extras = await readExtras();
  if (!extras.includes(e)) {
    await r.set(ADMINS_KEY, [...extras, e]);
  }
}

export async function removeAdmin(email: string): Promise<void> {
  const e = String(email).trim().toLowerCase();
  if (e === getSuperAdminEmail()) {
    throw new Error("cannot_remove_super");
  }
  const r = redis();
  if (!r) throw new Error("storage_not_configured");
  const extras = await readExtras();
  await r.set(ADMINS_KEY, extras.filter((x) => x !== e));
}
