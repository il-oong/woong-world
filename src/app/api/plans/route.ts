import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  createPlan,
  isStorageConfigured,
  listPlans,
  type NewPlanInput,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

async function userEmail(): Promise<string | null> {
  const session = await getValidSession();
  return session?.email ?? null;
}

export async function GET(req: NextRequest) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const email = await userEmail();
  if (!email) return Response.json({ error: "not_connected" }, { status: 401 });

  const period = new URL(req.url).searchParams.get("period");
  const all = await listPlans(email);
  const plans = period ? all.filter((p) => p.period === period) : all;
  return Response.json({ plans });
}

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const email = await userEmail();
  if (!email) return Response.json({ error: "not_connected" }, { status: 401 });

  let body: NewPlanInput;
  try {
    body = (await req.json()) as NewPlanInput;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.period || !body.periodKey || !body.title?.trim()) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const plan = await createPlan(email, body);
    return Response.json({ plan });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 },
    );
  }
}
