import { getValidSession } from "@/lib/google";
import { getCalendarFilter, setCalendarFilter } from "@/lib/calendar-filter";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  const ids = await getCalendarFilter(session.email);
  return Response.json({ ids });
}

export async function PUT(req: Request) {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  let body: { ids?: string[] };
  try { body = (await req.json()) as typeof body; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!Array.isArray(body.ids)) return Response.json({ error: "ids_required" }, { status: 400 });
  await setCalendarFilter(session.email, body.ids);
  return Response.json({ ok: true });
}
