import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  isRoutineStorageConfigured,
  todayIso,
  toggleCheck,
} from "@/lib/routines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isRoutineStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  let body: { date?: string };
  try {
    body = (await req.json().catch(() => ({}))) as { date?: string };
  } catch {
    body = {};
  }
  const date = body.date?.trim() || todayIso();
  const result = await toggleCheck(session.email, id, date);
  return Response.json({ ok: true, ...result, date });
}
