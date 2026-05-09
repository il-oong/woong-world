import { getValidSession } from "@/lib/google";
import { getUserCategories, saveUserCategories } from "@/lib/user-categories";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  const cats = await getUserCategories(session.email);
  return Response.json({ categories: cats });
}

export async function PUT(req: Request) {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  let body: { categories: { id: string; label: string; colorId: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.categories)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  await saveUserCategories(session.email, body.categories);
  return Response.json({ ok: true });
}
