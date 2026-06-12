import { engineCreateBackup, engineListBackups } from "@/lib/vault-sync/engine";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const backups = await engineListBackups();
  return Response.json({ backups });
}

export async function POST() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  try {
    const { tag, pushed } = await engineCreateBackup();
    return Response.json({ ok: true, tag, pushed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backup_failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
