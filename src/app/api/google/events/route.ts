import { type NextRequest } from "next/server";
import {
  createEvent,
  deleteEvent,
  getValidSession,
  listEvents,
  listAllCalendarsEvents,
  listCalendars,
  type CreateEventInput,
} from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const timeMin =
    url.searchParams.get("from") ??
    new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax =
    url.searchParams.get("to") ??
    new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

  const calendarId = url.searchParams.get("calendarId");

  try {
    let events;
    if (calendarId === "all") {
      const cals = await listCalendars(session);
      events = await listAllCalendarsEvents(session, timeMin, timeMax, cals.map((c) => c.id));
    } else {
      events = await listEvents(session, timeMin, timeMax, calendarId ?? "primary");
    }
    return Response.json({ events });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "list_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");           // 단일 날짜 (YYYY-MM-DD)
  const calendarId = url.searchParams.get("calendarId"); // 특정 캘린더 ID
  const dateFrom = url.searchParams.get("dateFrom");   // 범위 삭제 시작
  const dateTo = url.searchParams.get("dateTo");       // 범위 삭제 종료

  try {
    if (calendarId && dateFrom && dateTo) {
      // 특정 캘린더 + 날짜 범위 일괄 삭제
      const timeMin = `${dateFrom}T00:00:00+09:00`;
      const timeMax = `${dateTo}T23:59:59+09:00`;
      const events = await listEvents(session, timeMin, timeMax, calendarId);
      await Promise.allSettled(events.map((ev) => deleteEvent(session, ev.id, calendarId)));
      return Response.json({ deleted: events.length });
    }

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // 기존: 단일 날짜 전체 캘린더 삭제
      const timeMin = `${date}T00:00:00+09:00`;
      const timeMax = `${date}T23:59:59+09:00`;
      const cals = await listCalendars(session);
      const events = await listAllCalendarsEvents(
        session, timeMin, timeMax,
        cals.map((c) => c.id),
      );
      await Promise.allSettled(
        events.map((ev) => deleteEvent(session, ev.id, ev.calendarId ?? "primary")),
      );
      return Response.json({ deleted: events.length });
    }

    return Response.json(
      { error: "date 또는 (calendarId + dateFrom + dateTo) 필요" },
      { status: 400 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: CreateEventInput;
  try {
    body = (await req.json()) as CreateEventInput;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.summary || !body.start || !body.end || !body.kind) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  // Defense in depth: catch end <= start before hitting Google.
  // For "timed", body.start/end are "YYYY-MM-DDTHH:MM:00" strings (no TZ),
  // and lexical comparison matches chronological order. For "allday"/"project",
  // the lib adds +1 day to end at insert time, so equal dates are valid;
  // only reject when end is strictly before start.
  if (body.kind === "timed" && body.end <= body.start) {
    return Response.json(
      { error: "종료 시각이 시작 시각보다 늦어야 합니다." },
      { status: 400 },
    );
  }
  if ((body.kind === "allday" || body.kind === "project") && body.end < body.start) {
    return Response.json(
      { error: "종료일이 시작일보다 빠를 수 없습니다." },
      { status: 400 },
    );
  }

  try {
    const event = await createEvent(session, body);
    return Response.json({ event });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 },
    );
  }
}
