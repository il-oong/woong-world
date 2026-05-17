import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { getGoals, isStorageConfigured, saveGoals, type Goals } from "@/lib/life-dashboard";

export const dynamic = "force-dynamic";

async function email(): Promise<string | null> {
  const s = await getValidSession();
  return s?.email ?? null;
}

export async function GET() {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const goals = await getGoals(em);
  return Response.json({ goals });
}

export async function PUT(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const body = (await req.json()) as Goals;
  if (!body.year) return Response.json({ error: "year_required" }, { status: 400 });

  await saveGoals(em, body);
  return Response.json({ ok: true });
}
