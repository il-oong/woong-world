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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteEvent(session, id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete_failed" },
      { status: 500 },
    );
  }
}
