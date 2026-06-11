import { guardVaultSync } from "@/lib/vault-sync/guard";
import { syncNow } from "@/lib/vault-sync/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const state = await syncNow("manual");
  return Response.json({ ok: !state.lastError, state });
}
