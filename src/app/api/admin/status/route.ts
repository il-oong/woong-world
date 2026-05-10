import { getAdminEmail, isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await isAdminSession();
  return Response.json({
    isAdmin,
    adminEmail: getAdminEmail(),
  });
}
