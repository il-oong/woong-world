import { isAdminSession } from "@/lib/admin";

/**
 * Gate for VaultSync API routes. Returns a 403 Response if the caller is not an
 * admin, or null if allowed. Both the local (git CLI) and deploy (GitHub REST)
 * engines run behind this; the engine facade picks the right backend.
 */
export async function guardVaultSync(): Promise<Response | null> {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
