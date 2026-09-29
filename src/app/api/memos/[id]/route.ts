import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { isMemoStorageConfigured, removeMemo, updateMemo } from "@/lib/memos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMemoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  let body: { title?: unknown; text?: unknown; pinned?: unknown };
  try {
    body = (await req.json()) as { title?: unknown; text?: unknown; pinned?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: { title?: string; text?: string; pinned?: boolean } = {};
  if (typeof body.title === "string") {
    patch.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.text === "string") {
    const t = body.text.trim();
    if (!t) return Response.json({ error: "missing_text" }, { status: 400 });
    if (t.length > 5_000) return Response.json({ error: "text_too_long" }, { status: 400 });
    patch.text = t;
  }
  if (typeof body.pinned === "boolean") {
    patch.pinned = body.pinned;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "no_changes" }, { status: 400 });
  }

  const updated = await updateMemo(session.email, id, patch);
  if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, memo: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMemoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await removeMemo(session.email, id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
