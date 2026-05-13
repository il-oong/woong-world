import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addRoutine,
  getChecks,
  isRoutineStorageConfigured,
  listRoutines,
  todayIso,
  weeklyStats,
} from "@/lib/routines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isRoutineStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const today = todayIso();
  const [routines, checked] = await Promise.all([
    listRoutines(session.email),
    getChecks(session.email, today),
  ]);
  const weekly = await weeklyStats(session.email, today, routines);
  return Response.json({
    routines,
    todayChecked: checked,
    today,
    weekly,
  });
}

export async function POST(req: NextRequest) {
  if (!isRoutineStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  let body: { name?: string; weekdays?: unknown };
  try {
    body = (await req.json()) as { name?: string; weekdays?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "missing_name" }, { status: 400 });
  if (name.length > 80) {
    return Response.json({ error: "name_too_long" }, { status: 400 });
  }
  const routine = await addRoutine(session.email, name, body.weekdays);
  return Response.json({ ok: true, routine });
}
