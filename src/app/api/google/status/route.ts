import { isConfigured } from "@/lib/google";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isConfigured();
  if (!configured) {
    return Response.json({ configured: false, connected: false });
  }
  const session = await readSession();
  if (!session) return Response.json({ configured: true, connected: false });
  return Response.json({
    configured: true,
    connected: true,
    email: session.email,
  });
}
