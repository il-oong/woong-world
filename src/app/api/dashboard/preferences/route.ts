import { getValidSession } from "@/lib/google";
import { getDashboardConfig, saveDashboardConfig } from "@/lib/dashboard-preferences";
import { defaultDashboardConfig } from "@/lib/dashboard-config";
import { isSuperAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  try {
    const saved = await getDashboardConfig(session.email);
    return Response.json({
      config: saved ?? defaultDashboardConfig,
      saved: saved !== null,
      canMigrateLegacy: isSuperAdminEmail(session.email),
    });
  } catch {
    return Response.json({ error: "load_failed" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    return Response.json({ config: await saveDashboardConfig(session.email, input) });
  } catch (error) {
    if (error instanceof Error && (error.name === "ZodError" || error.message === "duplicate_widget"))
      return Response.json({ error: "invalid_config" }, { status: 400 });
    return Response.json({ error: "save_failed" }, { status: 503 });
  }
}
