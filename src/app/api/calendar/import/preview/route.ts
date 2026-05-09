import { parseCsv } from "@/lib/csv";
import { parseEventsFromSheet, type ParsedEvent } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let text: string;
  let correction: string | undefined;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "file_required" }, { status: 400 });
    text = await file.text();
    const c = formData.get("correction");
    if (c && typeof c === "string" && c.trim()) correction = c.trim();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }

  if (!correction) {
    const standard = parseCsv(text);
    if (standard.length > 0) {
      return Response.json({ events: standard, source: "csv" });
    }
  }

  try {
    const events = await parseEventsFromSheet(text, correction);
    return Response.json({ events, source: "gemini" });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "AI 파싱 실패" },
      { status: 422 },
    );
  }
}
