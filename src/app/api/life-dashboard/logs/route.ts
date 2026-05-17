import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import { getLogs, isStorageConfigured, setLog } from "@/lib/life-dashboard";

export const dynamic = "force-dynamic";

async function email(): Promise<string | null> {
  const s = await getValidSession();
  return s?.email ?? null;
}

export async function GET(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const ym = new URL(req.url).searchParams.get("ym");
  if (!ym || !/^\d{4}-\d{2}$/.test(ym))
    return Response.json({ error: "ym_required" }, { status: 400 });

  const logs = await getLogs(em, ym);
  return Response.json({ logs });
}

export async function POST(req: NextRequest) {
  if (!isStorageConfigured())
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  const em = await email();
  if (!em) return Response.json({ error: "not_connected" }, { status: 401 });

  const { ym, day, habitId, checked } = (await req.json()) as {
    ym?: string;
    day?: number;
    habitId?: string;
    checked?: boolean;
  };

  if (!ym || !day || !habitId || checked === undefined)
    return Response.json({ error: "invalid_body" }, { status: 400 });

  await setLog(em, ym, day, habitId, checked);
  return Response.json({ ok: true });
}
