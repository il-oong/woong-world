import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { addMemo, isMemoStorageConfigured, listMemos } from "@/lib/memos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isMemoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const memos = await listMemos(session.email);
  return Response.json({ memos });
}

export async function POST(req: NextRequest) {
  if (!isMemoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  let body: { title?: unknown; text?: unknown };
  try {
    body = (await req.json()) as { title?: unknown; text?: unknown };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "missing_text" }, { status: 400 });
  if (text.length > 5_000) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  try {
    const memo = await addMemo(session.email, text, title);
    return Response.json({ ok: true, memo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "add_failed";
    const status = msg === "limit_exceeded" ? 413 : 500;
    return Response.json({ error: msg }, { status });
  }
}
