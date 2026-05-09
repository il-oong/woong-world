import { getValidSession, createCalendar, createEvent } from "@/lib/google";
import { parseCsv, mapCategory } from "@/lib/csv";
import { parseEventsFromSheet, type ParsedEvent } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let text: string = "";
  let projectName: string | undefined;
  let directCalendarId: string | undefined;
  let previewedEvents: ParsedEvent[] | null = null;
  try {
    const formData = await req.formData();
    const eventsJson = formData.get("events");
    if (eventsJson && typeof eventsJson === "string") {
      try {
        const parsed = JSON.parse(eventsJson) as ParsedEvent[];
        if (Array.isArray(parsed) && parsed.length > 0) previewedEvents = parsed;
      } catch { /* ignore */ }
    }
    const file = formData.get("file") as File | null;
    if (!previewedEvents && !file) return Response.json({ error: "file_required" }, { status: 400 });
    if (file) text = await file.text();
    const pn = formData.get("projectName");
    if (pn && typeof pn === "string" && pn.trim()) projectName = pn.trim();
    const ci = formData.get("calendarId");
    if (ci && typeof ci === "string" && ci.trim() && ci.trim() !== "primary") {
      directCalendarId = ci.trim();
    }
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }

  // 미리보기 결과가 있으면 재파싱 없이 사용 (수정 지시문 반영된 결과 유지)
  let rows: ParsedEvent[];
  let usedGemini = false;

  if (previewedEvents) {
    rows = previewedEvents;
  } else {
    rows = parseCsv(text);
    if (rows.length === 0) {
      try {
        rows = await parseEventsFromSheet(text);
        usedGemini = true;
      } catch {
        return Response.json({ error: "no_valid_rows" }, { status: 400 });
      }
      if (rows.length === 0) {
        return Response.json({ error: "no_valid_rows" }, { status: 400 });
      }
    }
  }

  // 캘린더 ID 결정: directCalendarId > 신규 생성(projectName) > 기본 캘린더
  let targetCalendarId: string | undefined = directCalendarId;
  let calendarName: string | undefined;

  if (!targetCalendarId && projectName) {
    try {
      const newCal = await createCalendar(session, projectName);
      targetCalendarId = newCal.id;
      calendarName = projectName;
    } catch {
      return Response.json({ error: "캘린더 탭 생성 실패" }, { status: 500 });
    }
  }

  let succeeded = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      row.summary = row.summary.replace(/[\r\n\t]+/g, " ").trim();
      const categoryId = mapCategory(row.category);
      const hasTime = row.startTime && /^\d{2}:\d{2}$/.test(row.startTime);

      if (hasTime) {
        const endTime = row.endTime && /^\d{2}:\d{2}$/.test(row.endTime)
          ? row.endTime
          : (() => {
              const [h, m] = row.startTime!.split(":").map(Number);
              const endH = (h + 1) % 24;
              return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            })();

        await createEvent(session, {
          summary: row.summary,
          description: row.location ? `장소: ${row.location}` : undefined,
          kind: "timed",
          start: `${row.date}T${row.startTime}`,
          end: `${row.date}T${endTime}`,
          categoryId,
          calendarId: targetCalendarId,
        });
      } else {
        await createEvent(session, {
          summary: row.summary,
          description: row.location ? `장소: ${row.location}` : undefined,
          kind: "allday",
          start: row.date,
          end: row.date,
          categoryId,
          calendarId: targetCalendarId,
        });
      }
      succeeded++;
    } catch (e) {
      errors.push(`${row.summary}: ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  return Response.json({
    succeeded,
    failed: errors.length,
    errors,
    usedGemini,
    calendarName,
  });
}
