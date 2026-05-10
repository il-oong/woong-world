import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { addPlugin, loadPlugins } from "@/lib/plugins-store";
import {
  isValidPluginId,
  isValidRepo,
  type Plugin,
} from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const plugins = await loadPlugins();
  return Response.json({ plugins });
}

type AddBody = Partial<Plugin>;

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  const name = (body.name ?? "").trim();
  const repo = (body.repo ?? "").trim();
  const branch = (body.branch ?? "main").trim() || "main";
  const description = (body.description ?? "").trim();

  if (!id || !isValidPluginId(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  if (!name) return Response.json({ error: "missing_name" }, { status: 400 });
  if (!repo || !isValidRepo(repo)) {
    return Response.json({ error: "invalid_repo" }, { status: 400 });
  }

  const plugin: Plugin = {
    id,
    name,
    description,
    repo,
    branch,
    pr: typeof body.pr === "number" ? body.pr : null,
    path: typeof body.path === "string" && body.path ? body.path : null,
    url: typeof body.url === "string" && body.url ? body.url : null,
    embeddable: body.embeddable !== false,
    accent: typeof body.accent === "string" && body.accent ? body.accent : "#7dd3fc",
    tags: Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string") : [],
  };

  try {
    const next = await addPlugin(plugin);
    return Response.json({ ok: true, plugins: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "add_failed";
    const status = msg === "duplicate_id" ? 409 : msg === "redis_not_configured" ? 503 : 500;
    return Response.json({ error: msg }, { status });
  }
}
