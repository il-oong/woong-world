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
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }

  const timeMin = `${date}T00:00:00+09:00`;
  const timeMax = `${date}T23:59:59+09:00`;

  try {
    const cals = await listCalendars(session);
    const events = await listAllCalendarsEvents(
      session, timeMin, timeMax,
      cals.map((c) => c.id),
    );
    await Promise.allSettled(
      events.map((ev) => deleteEvent(session, ev.id, ev.calendarId ?? "primary")),
    );
    return Response.json({ deleted: events.length });
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
