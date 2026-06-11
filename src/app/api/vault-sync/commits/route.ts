import { recentCommits } from "@/lib/vault-sync/git";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const commits = await recentCommits(30);
  return Response.json({ commits });
}
