import { engineSync } from "@/lib/vault-sync/engine";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const state = await engineSync("manual");
  return Response.json({ ok: !state.lastError, state });
}
