import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  addTodo,
  isTodoStorageConfigured,
  listTodos,
  statsOf,
} from "@/lib/todos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isTodoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const todos = await listTodos(session.email);
  return Response.json({ todos, stats: statsOf(todos) });
}

export async function POST(req: NextRequest) {
  if (!isTodoStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) return Response.json({ error: "missing_text" }, { status: 400 });
  if (text.length > 280) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }
  try {
    const todo = await addTodo(session.email, text);
    return Response.json({ ok: true, todo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "add_failed";
    const status = msg === "limit_exceeded" ? 413 : 500;
    return Response.json({ error: msg }, { status });
  }
}
