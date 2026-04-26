import { getValidSession } from "@/lib/google";
import {
  deletePlan,
  getPlan,
  isStorageConfigured,
  updatePlan,
  type UpdatePlanInput,
} from "@/lib/plans";

export const dynamic = "force-dynamic";

async function userEmail(): Promise<string | null> {
  const session = await getValidSession();
  return session?.email ?? null;
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/plans/[id]">,
) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const email = await userEmail();
  if (!email) return Response.json({ error: "not_connected" }, { status: 401 });
  const { id } = await ctx.params;
  const plan = await getPlan(email, id);
  if (!plan) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ plan });
}

export async function PATCH(
  req: Request,
  ctx: RouteContext<"/api/plans/[id]">,
) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const email = await userEmail();
  if (!email) return Response.json({ error: "not_connected" }, { status: 401 });
  const { id } = await ctx.params;

  let body: UpdatePlanInput;
  try {
    body = (await req.json()) as UpdatePlanInput;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const plan = await updatePlan(email, id, body);
  if (!plan) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ plan });
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/plans/[id]">,
) {
  if (!isStorageConfigured()) {
    return Response.json({ error: "storage_not_configured" }, { status: 503 });
  }
  const email = await userEmail();
  if (!email) return Response.json({ error: "not_connected" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deletePlan(email, id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
