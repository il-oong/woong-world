import { type NextRequest } from "next/server";
import {
  engineBackupContents,
  engineCreateBackup,
  engineListBackups,
} from "@/lib/vault-sync/engine";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  // ?tag=... 이면 그 백업에 들어있는 파일 목록을 반환.
  const tag = req.nextUrl.searchParams.get("tag")?.trim();
  if (tag) {
    try {
      const files = await engineBackupContents(tag);
      return Response.json({ tag, files });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "contents_failed";
      return Response.json({ error: msg }, { status: msg === "invalid_tag" ? 400 : 500 });
    }
  }

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
