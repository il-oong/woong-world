import { jwtDecrypt, EncryptJWT } from "jose";
import { cookies } from "next/headers";

const COOKIE = "wh-google";
const STATE_COOKIE = "wh-google-state";

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const buf = new Uint8Array(32);
  buf.set(new TextEncoder().encode(secret).slice(0, 32));
  return buf;
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
