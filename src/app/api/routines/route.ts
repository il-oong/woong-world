import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addRoutine,
  getChecks,
  isRoutineStorageConfigured,
  listRoutines,
  monthlyStats,
  todayIso,
  weeklyStats,
} from "@/lib/routines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isRoutineStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  // 월간(30일) 통계는 캘린더 히트맵을 보여주는 루틴 페이지에서만 필요하므로
  // 명시적으로 요청한 경우에만 계산한다. (홈 위젯이 매번 N+30 Redis 호출하는 비용 회피)
  const include = new Set(
    (req.nextUrl.searchParams.get("include") ?? "").split(",").filter(Boolean),
  );
  const wantMonthly = include.has("monthly");

  const today = todayIso();
  const [routines, checked] = await Promise.all([
    listRoutines(session.email),
    getChecks(session.email, today),
  ]);
  const [weekly, monthly] = await Promise.all([
    weeklyStats(session.email, today, routines),
    wantMonthly ? monthlyStats(session.email, today, routines) : Promise.resolve(null),
  ]);
  return Response.json({
    routines,
    todayChecked: checked,
    today,
    weekly,
    ...(monthly ? { monthly } : {}),
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
