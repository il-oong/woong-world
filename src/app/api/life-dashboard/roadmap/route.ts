import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { getRoadmap, isStorageConfigured, saveRoadmap, type Roadmap } from "@/lib/life-dashboard";

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

  const roadmap = await getRoadmap(em);
  return Response.json({ roadmap });
}

export async function PUT(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const body = (await req.json()) as Roadmap;
  if (!body.year) return Response.json({ error: "year_required" }, { status: 400 });

  await saveRoadmap(em, body);
  return Response.json({ ok: true });
}
