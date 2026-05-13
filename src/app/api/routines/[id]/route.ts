import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  isRoutineStorageConfigured,
  removeRoutine,
  updateRoutine,
} from "@/lib/routines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
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
  let body: { name?: string; weekdays?: unknown };
  try {
    body = (await req.json()) as { name?: string; weekdays?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch: { name?: string; weekdays?: unknown } = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) return Response.json({ error: "missing_name" }, { status: 400 });
    if (trimmed.length > 80) {
      return Response.json({ error: "name_too_long" }, { status: 400 });
    }
    patch.name = trimmed;
  }
  if (body.weekdays !== undefined) patch.weekdays = body.weekdays;
  if (patch.name === undefined && patch.weekdays === undefined) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }
  const updated = await updateRoutine(session.email, id, patch);
  if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, routine: updated });
}

export async function DELETE(
  _req: NextRequest,
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
  const removed = await removeRoutine(session.email, id);
  if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
