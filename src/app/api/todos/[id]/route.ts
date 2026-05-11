import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  isTodoStorageConfigured,
  removeTodo,
  updateTodo,
} from "@/lib/todos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTodoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  let body: { text?: string; done?: boolean };
  try {
    body = (await req.json()) as { text?: string; done?: boolean };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: { text?: string; done?: boolean } = {};
  if (typeof body.text === "string") {
    const t = body.text.trim();
    if (!t) return Response.json({ error: "missing_text" }, { status: 400 });
    if (t.length > 280) return Response.json({ error: "text_too_long" }, { status: 400 });
    patch.text = t;
  }
  if (typeof body.done === "boolean") {
    patch.done = body.done;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "no_changes" }, { status: 400 });
  }

  const updated = await updateTodo(session.email, id, patch);
  if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, todo: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTodoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await removeTodo(session.email, id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
