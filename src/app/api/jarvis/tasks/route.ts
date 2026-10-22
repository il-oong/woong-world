import { isAdminSession } from "@/lib/admin";
import { listDevTasks } from "@/lib/jarvis-dev";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "admin_required" }, { status: 403 });
  }
  try {
    return Response.json({ tasks: await listDevTasks() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "list_failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
