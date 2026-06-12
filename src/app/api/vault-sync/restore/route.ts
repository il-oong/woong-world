import { type NextRequest } from "next/server";
import { engineRestore } from "@/lib/vault-sync/engine";
import { guardVaultSync } from "@/lib/vault-sync/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  let body: { tag?: string };
  try {
    body = (await req.json()) as { tag?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const tag = body.tag?.trim();
  if (!tag) return Response.json({ error: "missing_tag" }, { status: 400 });

  try {
    const { safetyTag, committed } = await engineRestore(tag);
    return Response.json({ ok: true, safetyTag, committed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "restore_failed";
    const status =
      msg === "invalid_tag" || msg === "unknown_tag" ? 400 : 500;
    return Response.json({ error: msg }, { status });
  }
}
