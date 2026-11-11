import { Redis } from "@upstash/redis";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * The journal is end-to-end-ish: content and date metadata are encrypted
 * with a key derived from the user's password. The server holds no copy
 * of the key — it is kept only in the unlock cookie, which is itself
 * JWT-encrypted under SESSION_SECRET and expires after 30 minutes.
 * If the user forgets the password they lose the content for good. That
 * trade-off is explicit; the journal is for venting, and the extra lock
 * is the point.
 */

export type JournalEntry = {
  /** Epoch ms when the entry was written. */
  ts: number;
  text: string;
};

export type JournalDay = {
  date: string; // YYYY-MM-DD
  entries: JournalEntry[];
};

// ---- Redis plumbing ----------------------------------------------------

function getCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isJournalStorageConfigured(): boolean {
  return getCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const c = getCreds();
  if (!c) throw new Error("Redis credentials not set");
  _redis = new Redis(c);
  return _redis;
}

const credKey = (email: string) => `journal:cred:${email.toLowerCase()}`;
const datesKey = (email: string) => `journal:dates:${email.toLowerCase()}`;
const dayKey = (email: string, date: string) =>
  `journal:day:${email.toLowerCase()}:${date}`;
const rateKey = (email: string) => `journal:rate:${email.toLowerCase()}`;

// ---- Password + key derivation ----------------------------------------

/**
 * Stored auth material. The verifier is a password-derived hash used only
 * to tell right/wrong passwords apart quickly; the real encryption key is
 * derived separately at every unlock from the password + encSalt. We never
 * persist the encryption key itself.
 */
type JournalCred = {
  /** Base64 random salt, 16 bytes. */
  authSalt: string;
  /** Base64 scrypt(password, authSalt, 32). */
  authHash: string;
  /** Base64 random salt, 16 bytes — used to derive the encryption key. */
  encSalt: string;
  /** Rough scrypt cost knob; raise only if you're ready to re-key. */
  n: number;
  createdAt: number;
  updatedAt: number;
};

// scrypt params — cost ~128MB memory, ~100ms on a modern CPU. Fine for a
// per-unlock derivation; too slow for anything per-request.
const SCRYPT_N = 1 << 15; // 32768
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

function derive(password: string, saltB64: string): Buffer {
  const salt = Buffer.from(saltB64, "base64");
  return scryptSync(password.normalize("NFC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
}

export async function getCred(email: string): Promise<JournalCred | null> {
  const raw = await redis().get<JournalCred | string>(credKey(email));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as JournalCred) : raw;
}

export async function hasPassword(email: string): Promise<boolean> {
  return (await getCred(email)) !== null;
}

/** First-time password setup. Refuses if a cred already exists — resets go through resetPassword. */
export async function setInitialPassword(
  email: string,
  password: string,
): Promise<{ ok: true; encKey: Buffer } | { ok: false; error: "exists" }> {
  if (await hasPassword(email)) return { ok: false, error: "exists" };
  const authSalt = randomBytes(16).toString("base64");
  const encSalt = randomBytes(16).toString("base64");
  const authHash = derive(password, authSalt).toString("base64");
  const encKey = derive(password, encSalt);
  const cred: JournalCred = {
    authSalt,
    authHash,
    encSalt,
    n: SCRYPT_N,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await redis().set(credKey(email), JSON.stringify(cred));
  return { ok: true, encKey };
}

/**
 * Verifies a password and returns the derived encryption key. Previous
 * entries, if any, were encrypted under a different key (the old password)
 * and cannot be recovered after a reset — the caller must know that.
 */
export async function resetPassword(
  email: string,
  password: string,
): Promise<{ encKey: Buffer }> {
  const authSalt = randomBytes(16).toString("base64");
  const encSalt = randomBytes(16).toString("base64");
  const authHash = derive(password, authSalt).toString("base64");
  const encKey = derive(password, encSalt);
  const previous = await getCred(email);
  const cred: JournalCred = {
    authSalt,
    authHash,
    encSalt,
    n: SCRYPT_N,
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await redis().set(credKey(email), JSON.stringify(cred));
  // Old-key ciphertext is now permanently unreadable. Dropping the index
  // so the UI doesn't lie about days that existed under the previous
  // password; the ciphertext blobs sit idle until Redis garbage-collects
  // them or the user writes something new (the write overwrites the day).
  await redis().del(datesKey(email));
  return { encKey };
}

export type UnlockResult =
  | { ok: true; encKey: Buffer }
  | { ok: false; error: "no_password" | "bad_password" | "rate_limited" };

export async function unlock(
  email: string,
  password: string,
): Promise<UnlockResult> {
  // Rate limit before touching the KDF to make brute-forcing expensive on
  // our side too.
  if (!(await consumeAttempt(email))) {
    return { ok: false, error: "rate_limited" };
  }
  const cred = await getCred(email);
  if (!cred) return { ok: false, error: "no_password" };
  const attempt = derive(password, cred.authSalt);
  const stored = Buffer.from(cred.authHash, "base64");
  if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
    return { ok: false, error: "bad_password" };
  }
  await clearAttempts(email);
  const encKey = derive(password, cred.encSalt);
  return { ok: true, encKey };
}

// Hard cap of 8 bad attempts per 15-minute window. Resets on a correct
// unlock or after the TTL expires.
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

async function consumeAttempt(email: string): Promise<boolean> {
  const key = rateKey(email);
  const count = await redis().incr(key);
  if (count === 1) await redis().expire(key, ATTEMPT_WINDOW_SECONDS);
  return count <= MAX_ATTEMPTS;
}

async function clearAttempts(email: string): Promise<void> {
  await redis().del(rateKey(email));
}

// ---- AES-GCM payload codec -------------------------------------------

const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptJson<T>(payload: string, key: Buffer): T {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

// ---- Day / date-index operations --------------------------------------

const MAX_ENTRY_CHARS = 20_000;
const MAX_ENTRIES_PER_DAY = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(date: unknown): date is string {
  return typeof date === "string" && DATE_RE.test(date) && !Number.isNaN(Date.parse(date));
}

export async function listDates(
  email: string,
  encKey: Buffer,
): Promise<string[]> {
  const raw = await redis().get<string>(datesKey(email));
  if (!raw) return [];
  try {
    const dates = decryptJson<string[]>(raw, encKey);
    return Array.isArray(dates) ? dates : [];
  } catch {
    // Wrong key (password changed) or corrupted blob — treat as empty so
    // the UI doesn't crash; writing a new entry will rebuild the index.
    return [];
  }
}

async function addDate(
  email: string,
  encKey: Buffer,
  date: string,
): Promise<void> {
  const dates = await listDates(email, encKey);
  if (dates.includes(date)) return;
  dates.push(date);
  dates.sort(); // keeps the calendar render deterministic
  await redis().set(datesKey(email), encryptJson(dates, encKey));
}

async function removeDate(
  email: string,
  encKey: Buffer,
  date: string,
): Promise<void> {
  const dates = await listDates(email, encKey);
  const next = dates.filter((d) => d !== date);
  if (next.length === dates.length) return;
  await redis().set(datesKey(email), encryptJson(next, encKey));
}

export async function getDay(
  email: string,
  encKey: Buffer,
  date: string,
): Promise<JournalDay | null> {
  if (!isValidDate(date)) return null;
  const raw = await redis().get<string>(dayKey(email, date));
  if (!raw) return null;
  try {
    const entries = decryptJson<JournalEntry[]>(raw, encKey);
    return { date, entries: Array.isArray(entries) ? entries : [] };
  } catch {
    return null;
  }
}

export async function appendEntry(
  email: string,
  encKey: Buffer,
  date: string,
  text: string,
  nowMs = Date.now(),
): Promise<JournalDay | { error: string }> {
  if (!isValidDate(date)) return { error: "invalid_date" };
  const trimmed = text.trim();
  if (!trimmed) return { error: "empty" };
  if (trimmed.length > MAX_ENTRY_CHARS) return { error: "too_long" };
  const existing = (await getDay(email, encKey, date))?.entries ?? [];
  if (existing.length >= MAX_ENTRIES_PER_DAY) {
    return { error: "day_full" };
  }
  const next: JournalEntry[] = [...existing, { ts: nowMs, text: trimmed }];
  await redis().set(dayKey(email, date), encryptJson(next, encKey));
  await addDate(email, encKey, date);
  return { date, entries: next };
}

export async function updateEntry(
  email: string,
  encKey: Buffer,
  date: string,
  entryTs: number,
  text: string,
): Promise<JournalDay | { error: string }> {
  if (!isValidDate(date)) return { error: "invalid_date" };
  const trimmed = text.trim();
  if (!trimmed) return { error: "empty" };
  if (trimmed.length > MAX_ENTRY_CHARS) return { error: "too_long" };
  const day = await getDay(email, encKey, date);
  if (!day) return { error: "not_found" };
  const idx = day.entries.findIndex((e) => e.ts === entryTs);
  if (idx === -1) return { error: "not_found" };
  const next = day.entries.slice();
  next[idx] = { ts: entryTs, text: trimmed };
  await redis().set(dayKey(email, date), encryptJson(next, encKey));
  return { date, entries: next };
}

export async function deleteEntry(
  email: string,
  encKey: Buffer,
  date: string,
  entryTs: number,
): Promise<JournalDay | { error: string } | { deleted: true }> {
  if (!isValidDate(date)) return { error: "invalid_date" };
  const day = await getDay(email, encKey, date);
  if (!day) return { error: "not_found" };
  const next = day.entries.filter((e) => e.ts !== entryTs);
  if (next.length === day.entries.length) return { error: "not_found" };
  if (next.length === 0) {
    await redis().del(dayKey(email, date));
    await removeDate(email, encKey, date);
    return { deleted: true };
  }
  await redis().set(dayKey(email, date), encryptJson(next, encKey));
  return { date, entries: next };
}
