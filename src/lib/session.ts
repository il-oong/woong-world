import { jwtDecrypt, EncryptJWT } from "jose";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "wh-google";
const STATE_COOKIE = "wh-google-state";

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is not set");

  // `openssl rand -hex 32` is the documented form. Hashing the full secret
  // avoids silently discarding entropy after byte 32, which the old zero-pad
  // approach did for short values.
  const source = /^[0-9a-f]{64}$/i.test(secret)
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "utf8");
  if (source.byteLength < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 random bytes");
  }
  return new Uint8Array(createHash("sha256").update(source).digest());
}

export type GoogleSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
};

export async function readSession(): Promise<GoogleSession | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, getKey());
    return payload.data as GoogleSession;
  } catch {
    return null;
  }
}

export async function writeSession(s: GoogleSession): Promise<void> {
  const jwt = await new EncryptJWT({ data: s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .encrypt(getKey());
  const c = await cookies();
  c.set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
}

export async function clearSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function setStateCookie(state: string): Promise<void> {
  const c = await cookies();
  c.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function readStateCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(STATE_COOKIE)?.value ?? null;
}

export async function clearStateCookie(): Promise<void> {
  const c = await cookies();
  c.delete(STATE_COOKIE);
}
