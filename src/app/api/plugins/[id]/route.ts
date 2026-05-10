import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { removePlugin, updatePlugin } from "@/lib/plugins-store";
import { isValidRepo, type Plugin } from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const next = await removePlugin(id);
    return Response.json({ ok: true, plugins: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "remove_failed";
    const status = msg === "not_found" ? 404 : msg === "redis_not_configured" ? 503 : 500;
    return Response.json({ error: msg }, { status });
  }
}

type PatchBody = Partial<Omit<Plugin, "id">>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.repo !== undefined && !isValidRepo(body.repo)) {
    return Response.json({ error: "invalid_repo" }, { status: 400 });
  }

  try {
    const next = await updatePlugin(id, body);
    return Response.json({ ok: true, plugins: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update_failed";
    const status = msg === "not_found" ? 404 : msg === "redis_not_configured" ? 503 : 500;
    return Response.json({ error: msg }, { status });
  }
}
