import { engineCommits } from "@/lib/vault-sync/engine";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const commits = await engineCommits(30);
  return Response.json({ commits });
}
