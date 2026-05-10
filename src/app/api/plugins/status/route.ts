import { isAdminSession } from "@/lib/admin";
import { getAllPluginStatuses } from "@/lib/github-status";
import { loadPlugins } from "@/lib/plugins-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const isAdmin = await isAdminSession();
  if (!isAdmin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const plugins = await loadPlugins();
    const statuses = await getAllPluginStatuses(plugins);
    return Response.json({ plugins, statuses });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "status_failed" },
      { status: 500 },
    );
  }
}
