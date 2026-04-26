import { type NextRequest } from "next/server";
import { getValidSession } from "@/lib/google";
import {
  getPlan,
  isStorageConfigured,
  listPlans,
} from "@/lib/plans";
import { isGeminiConfigured, reviewPlan, reviewPortfolio } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  if (!isGeminiConfigured()) {
    return Response.json({ error: "gemini_not_configured" }, { status: 503 });
  }
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }

  let body: { planId?: string; portfolio?: boolean };
  try {
    body = (await req.json()) as { planId?: string; portfolio?: boolean };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (body.portfolio) {
      const all = await listPlans(session.email);
      if (all.length === 0) {
        return Response.json({ error: "no_plans" }, { status: 400 });
      }
      const result = await reviewPortfolio(all);
      return Response.json({ review: result });
    }
    if (!body.planId) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }
    const plan = await getPlan(session.email, body.planId);
    if (!plan) return Response.json({ error: "not_found" }, { status: 404 });
    const result = await reviewPlan(plan);
    return Response.json({ review: result });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "review_failed" },
      { status: 500 },
    );
  }
}
