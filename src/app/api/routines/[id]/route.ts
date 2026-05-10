import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  isRoutineStorageConfigured,
  removeRoutine,
  renameRoutine,
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
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "missing_name" }, { status: 400 });
  const updated = await renameRoutine(session.email, id, name);
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
