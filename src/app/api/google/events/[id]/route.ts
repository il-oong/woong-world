import { deleteEvent, updateEvent, getValidSession, type CreateEventInput } from "@/lib/google";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getValidSession();
  if (!session) return Response.json({ error: "not_connected" }, { status: 401 });
  const { id } = await params;
  let body: CreateEventInput & { calendarId?: string };
  try {
    body = (await req.json()) as CreateEventInput & { calendarId?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
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
    const event = await updateEvent(session, id, body);
    return Response.json({ event });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "update_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  const calendarId = new URL(req.url).searchParams.get("calendarId") ?? "primary";
  try {
    await deleteEvent(session, id, calendarId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete_failed" },
      { status: 500 },
    );
  }
}
