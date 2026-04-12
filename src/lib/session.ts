/**
 * Lightweight HMAC-SHA256 session cookie, compatible with both Edge (proxy.ts)
 * and Node.js (API routes).
 *
 * Cookie value format:  base64(payload) "." hex(hmac)
 *   payload = { email, exp }
 *
 * Requires env: SESSION_SECRET (≥32 hex chars). If missing, session
 * operations silently fail and the server falls back to client-only auth.
 */

const SECRET_HEX = process.env.SESSION_SECRET ?? "";
const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getKey(): Promise<CryptoKey | null> {
  if (SECRET_HEX.length < 32) return null; // too short or unset
  const raw = hexToBytes(SECRET_HEX);
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Create a signed cookie value for the given admin email.
 * Returns null if SESSION_SECRET is not configured.
 */
export async function createSessionCookie(email: string): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;

  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Date.now() + SESSION_TTL_MS,
  });

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return btoa(payload) + "." + bytesToHex(new Uint8Array(sig));
}

export interface SessionData {
  email: string;
  exp: number;
}

/**
 * Parse and verify a session cookie value.
 * Returns session data if valid and not expired, null otherwise.
 */
export async function verifySession(
  cookie: string | undefined | null,
): Promise<SessionData | null> {
  if (!cookie) return null;

  const key = await getKey();
  if (!key) return null;

  const dotIdx = cookie.indexOf(".");
  if (dotIdx < 1) return null;

  const b64payload = cookie.slice(0, dotIdx);
  const sigHex = cookie.slice(dotIdx + 1);

  let payload: string;
  try {
    payload = atob(b64payload);
  } catch {
    return null;
  }

  const sigBytes = hexToBytes(sigHex);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  try {
    const data: SessionData = JSON.parse(payload);
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = "__admin_session";
export const SESSION_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000);
