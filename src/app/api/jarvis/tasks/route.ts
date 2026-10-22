import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { getDevTask, listDevTasks } from "@/lib/jarvis-dev";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "admin_required" }, { status: 403 });
  }
  try {
    const issue = req.nextUrl.searchParams.get("issue");
    if (issue !== null) {
      const number = Number(issue);
      if (!Number.isInteger(number) || number <= 0) {
        return Response.json({ error: "invalid_issue" }, { status: 400 });
      }
      const task = await getDevTask(number);
      return task
        ? Response.json({ task })
        : Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ tasks: await listDevTasks() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "list_failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
