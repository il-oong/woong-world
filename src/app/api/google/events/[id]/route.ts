import { deleteEvent, getValidSession, patchEvent, patchEventMeta, type CreateEventInput } from "@/lib/google";
import { isEventTypeRestriction } from "@/lib/calendar-actions";

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
    // PATCH, not a full replace: a replace drops fields the form does not know (attendees, location,
    // recurrence, event type) and Google rejects it for events it created itself.
    const event = await patchEvent(session, id, body);
    return Response.json({ event });
  } catch (e) {
    if (isEventTypeRestriction(e)) {
      try {
        const event = await patchEventMeta(session, id, body);
        return Response.json({
          event,
          notice:
            "이 일정은 지메일 예약 등 구글이 자동으로 만든 일정이라 제목, 시간, 메모는 바꿀 수 없어요. 알림과 카테고리만 저장했어요.",
        });
      } catch {
        return Response.json(
          { error: "이 일정은 구글이 자동으로 만든 일정이라 수정할 수 없어요. 구글 캘린더에서 직접 바꿔 주세요." },
          { status: 400 },
        );
      }
    }
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
