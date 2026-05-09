import { getValidSession } from "@/lib/google";
import { getOrCreateToken, createToken } from "@/lib/briefing-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  const token = await getOrCreateToken(session.email);
  return Response.json({ token });
}

export async function POST() {
  const session = await getValidSession();
  if (!session?.email) return Response.json({ error: "not_connected" }, { status: 401 });
  const token = await createToken(session.email);
  return Response.json({ token });
}
