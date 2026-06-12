import { isAdminSession } from "@/lib/admin";
import { engineStatus } from "@/lib/vault-sync/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return Response.json(await engineStatus());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "status_failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
