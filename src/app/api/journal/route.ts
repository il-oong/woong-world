import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  appendEntry,
  deleteEntry,
  getDay,
  hasPassword,
  isCurrentGeneration,
  isJournalStorageConfigured,
  isValidDate,
  listDates,
  resetPassword,
  setInitialPassword,
  unlock,
  updateEntry,
} from "@/lib/journal";
import {
  clearJournalUnlock,
  readJournalUnlock,
  writeJournalUnlock,
  type UnlockRead,
} from "@/lib/journal-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = Record<string, unknown>;

function err(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function readBody(req: NextRequest): Promise<Body | Response> {
  try {
    const data = (await req.json()) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return err(400, "invalid_json");
    }
    return data as Body;
  } catch {
    return err(400, "invalid_json");
  }
}

function asString(value: unknown, maxLen: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen
    ? value
    : null;
}

/**
 * Returns the active encryption key only when the cookie's credential
 * generation still matches what the user has on the server. A stale
 * cookie (another device reset the password) is cleared immediately so
 * a write under the dead key cannot corrupt data under the live key.
 */
async function requireUnlock(email: string): Promise<UnlockRead | null> {
  const cookie = await readJournalUnlock(email);
  if (!cookie) return null;
  if (!(await isCurrentGeneration(email, cookie.gen))) {
    await clearJournalUnlock();
    return null;
  }
  return cookie;
}

export async function GET(req: NextRequest) {
  if (!isJournalStorageConfigured()) return err(503, "storage_not_configured");
  const session = await getValidSession();
  if (!session?.email) return err(401, "not_connected");
  const email = session.email;

  const url = req.nextUrl;
  const op = url.searchParams.get("op") ?? "state";

  if (op === "state") {
    const hasPw = await hasPassword(email);
    const cookie = hasPw ? await requireUnlock(email) : null;
    const unlocked = Boolean(cookie);
    const dates = unlocked && cookie ? await listDates(email, cookie.key) : [];
    return Response.json({
      hasPassword: hasPw,
      unlocked,
      dates,
      expiresAt: cookie?.expiresAt ?? null,
    });
  }

  if (op === "day") {
    const date = url.searchParams.get("date") ?? "";
    if (!isValidDate(date)) return err(400, "invalid_date");
    const cookie = await requireUnlock(email);
    if (!cookie) return err(401, "locked");
    const day = await getDay(email, cookie.key, date);
    return Response.json({ day: day ?? { date, entries: [] } });
  }

  return err(400, "unknown_op");
}

export async function POST(req: NextRequest) {
  if (!isJournalStorageConfigured()) return err(503, "storage_not_configured");
  const session = await getValidSession();
  if (!session?.email) return err(401, "not_connected");
  const email = session.email;

  const body = await readBody(req);
  if (body instanceof Response) return body;

  const op = asString(body.op, 32);
  if (!op) return err(400, "invalid_input");

  if (op === "set_password") {
    const password = asString(body.password, 200);
    if (!password || password.length < 4) return err(400, "password_too_short");
    const result = await setInitialPassword(email, password);
    if (!result.ok) return err(409, "exists");
    await writeJournalUnlock(email, result.encKey, result.gen);
    return Response.json({ ok: true });
  }

  if (op === "reset_password") {
    // Resetting discards the ability to decrypt entries written under the
    // previous password. The UI puts a "I understand" gate in front of this.
    const password = asString(body.password, 200);
    if (!password || password.length < 4) return err(400, "password_too_short");
    const { encKey, gen } = await resetPassword(email, password);
    await writeJournalUnlock(email, encKey, gen);
    return Response.json({ ok: true });
  }

  if (op === "unlock") {
    const password = asString(body.password, 200);
    if (!password) return err(400, "invalid_input");
    const result = await unlock(email, password);
    if (!result.ok) return err(result.error === "rate_limited" ? 429 : 401, result.error);
    await writeJournalUnlock(email, result.encKey, result.gen);
    return Response.json({ ok: true });
  }

  if (op === "lock") {
    await clearJournalUnlock();
    return Response.json({ ok: true });
  }

  function mutationError(code: string): Response {
    if (code === "not_found") return err(404, code);
    if (code === "busy") return err(409, code);
    return err(400, code);
  }

  if (op === "append") {
    const date = asString(body.date, 20);
    const text = asString(body.text, 20_000);
    if (!date || !isValidDate(date) || !text) return err(400, "invalid_input");
    const cookie = await requireUnlock(email);
    if (!cookie) return err(401, "locked");
    const result = await appendEntry(email, cookie.key, date, text);
    if ("error" in result) return mutationError(result.error);
    return Response.json({ day: result });
  }

  if (op === "update") {
    const date = asString(body.date, 20);
    const text = asString(body.text, 20_000);
    const ts = typeof body.ts === "number" ? body.ts : NaN;
    if (!date || !isValidDate(date) || !text || !Number.isFinite(ts)) {
      return err(400, "invalid_input");
    }
    const cookie = await requireUnlock(email);
    if (!cookie) return err(401, "locked");
    const result = await updateEntry(email, cookie.key, date, ts, text);
    if ("error" in result) return mutationError(result.error);
    return Response.json({ day: result });
  }

  if (op === "delete") {
    const date = asString(body.date, 20);
    const ts = typeof body.ts === "number" ? body.ts : NaN;
    if (!date || !isValidDate(date) || !Number.isFinite(ts)) {
      return err(400, "invalid_input");
    }
    const cookie = await requireUnlock(email);
    if (!cookie) return err(401, "locked");
    const result = await deleteEntry(email, cookie.key, date, ts);
    if ("error" in result) return mutationError(result.error);
    return Response.json(result);
  }

  return err(400, "unknown_op");
}
