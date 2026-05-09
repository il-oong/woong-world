import { getValidSession, listCalendars, createCalendar } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session) return Response.json({ error: "not_connected" }, { status: 401 });
  try {
    const calendars = await listCalendars(session);
    return Response.json({ calendars });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "list_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return Response.json({ error: "not_connected" }, { status: 401 });
  let body: { summary?: string; description?: string };
  try { body = (await req.json()) as typeof body; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.summary?.trim()) return Response.json({ error: "summary_required" }, { status: 400 });
  try {
    const calendar = await createCalendar(session, body.summary.trim(), body.description);
    return Response.json({ calendar });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "create_failed" }, { status: 500 });
  }
}
