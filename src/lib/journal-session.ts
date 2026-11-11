import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Journal unlock cookie: carries the AES-GCM encryption key derived at
 * unlock time, encrypted under SESSION_SECRET and bound to the user's
 * email. 30-minute TTL — the user types the password again after that.
 */

const COOKIE = "wh-journal";
const TTL_SECONDS = 30 * 60;

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const source = /^[0-9a-f]{64}$/i.test(secret)
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "utf8");
  if (source.byteLength < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 random bytes");
  }
  // Separate domain from the main session key so a leaked journal cookie
  // can't be replayed against the Google session, and vice versa.
  return new Uint8Array(
    createHash("sha256").update(source).update("journal").digest(),
  );
}

type UnlockPayload = {
  email: string;
  /** Base64 encryption key (32 bytes). */
  key: string;
  /**
   * Credential generation this cookie was issued under — rotates on every
   * password change. A cookie issued under an older generation is refused
   * so a stale device cannot write new ciphertext under the old key, which
   * would silently corrupt data on the current key.
   */
  gen: number;
};

export async function writeJournalUnlock(
  email: string,
  encKey: Buffer,
  gen: number,
): Promise<void> {
  const data: UnlockPayload = {
    email,
    key: encKey.toString("base64"),
    gen,
  };
  const jwt = await new EncryptJWT({ data })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .encrypt(getKey());
  const c = await cookies();
  c.set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export type UnlockRead = {
  key: Buffer;
  gen: number;
  /** Epoch ms when the cookie expires (based on the JWT exp claim). */
  expiresAt: number;
};

export async function readJournalUnlock(
  email: string,
): Promise<UnlockRead | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, getKey());
    const data = payload.data as UnlockPayload | undefined;
    if (!data || data.email !== email) return null;
    if (typeof data.gen !== "number") return null;
    const exp = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    return {
      key: Buffer.from(data.key, "base64"),
      gen: data.gen,
      expiresAt: exp,
    };
  } catch {
    return null;
  }
}

export async function clearJournalUnlock(): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
