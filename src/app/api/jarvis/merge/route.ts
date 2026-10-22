import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { mergeDevTaskPr } from "@/lib/jarvis-dev";

export const dynamic = "force-dynamic";

/** Merges a JARVIS-opened PR. Called only from the explicit merge button. */
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "admin_required" }, { status: 403 });
  }
  let body: { pr?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.pr !== "number" || !Number.isInteger(body.pr) || body.pr <= 0) {
    return Response.json({ error: "invalid_pr" }, { status: 400 });
  }
  try {
    return Response.json({ ok: true, ...(await mergeDevTaskPr(body.pr)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "merge_failed";
    return Response.json({ error: message }, { status: message.startsWith("github_") ? 502 : 409 });
  }
}
