import { createBackupTag, listBackups } from "@/lib/vault-sync/git";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  const backups = await listBackups();
  return Response.json({ backups });
}

export async function POST() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  try {
    const { tag, pushed } = await createBackupTag();
    return Response.json({ ok: true, tag, pushed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backup_failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
