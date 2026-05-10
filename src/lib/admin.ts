import { getValidSession } from "./google";
import { type GoogleSession } from "./session";

const DEFAULT_ADMIN_EMAIL = "kww2962@gmail.com";

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase() === getAdminEmail();
}

export async function isAdminSession(): Promise<boolean> {
  const s = await getValidSession();
  return isAdminEmail(s?.email ?? null);
}

export async function getAdminSession(): Promise<GoogleSession | null> {
  const s = await getValidSession();
  if (!s || !isAdminEmail(s.email)) return null;
  return s;
}
