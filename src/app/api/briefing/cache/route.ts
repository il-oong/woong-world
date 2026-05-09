import { getValidSession } from "@/lib/google";
import { getBriefingCache } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  if (!session?.email) {
    return Response.json({ error: "not_connected" }, { status: 401 });
  }
  const cache = await getBriefingCache(session.email);
  if (!cache) {
    return Response.json({ cache: null });
  }
  return Response.json({ cache });
}
