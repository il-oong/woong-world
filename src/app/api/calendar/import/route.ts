import { getValidSession, createEvent } from "@/lib/google";
import { parseCsv, mapCategory } from "@/lib/csv";
import { parseEventsFromSheet, type ParsedEvent } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let text: string;
  let yearHint: number | undefined;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "file_required" }, { status: 400 });
    text = await file.text();
    const y = formData.get("year");
    if (y && !isNaN(Number(y))) yearHint = Number(y);
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }

  // 표준 파서 시도 → 실패 시 Gemini로 폴백
  let rows: ParsedEvent[] = parseCsv(text);
  let usedGemini = false;

  if (rows.length === 0) {
    try {
      rows = await parseEventsFromSheet(text, yearHint);
      usedGemini = true;
    } catch {
      return Response.json({ error: "no_valid_rows" }, { status: 400 });
    }
    if (rows.length === 0) {
      return Response.json({ error: "no_valid_rows" }, { status: 400 });
    }
  }

  let succeeded = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
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
        });
      } else {
        await createEvent(session, {
          summary: row.summary,
          description: row.location ? `장소: ${row.location}` : undefined,
          kind: "allday",
          start: row.date,
          end: row.date,
          categoryId,
        });
      }
      succeeded++;
    } catch (e) {
      errors.push(`${row.summary}: ${e instanceof Error ? e.message : "실패"}`);
    }
  }

  return Response.json({ succeeded, failed: errors.length, errors, usedGemini });
}
