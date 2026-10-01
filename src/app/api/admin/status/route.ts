import { isAdminEmail, isSuperAdminEmail } from "@/lib/admin";
import { getValidSession } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidSession();
  const isAdmin = await isAdminEmail(session?.email);
  return Response.json({
    isAdmin,
    isSuperAdmin: isSuperAdminEmail(session?.email),
  });
}
