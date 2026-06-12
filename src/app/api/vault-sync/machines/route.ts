import { type NextRequest } from "next/server";
import { guardVaultSync } from "@/lib/vault-sync/guard";
import {
  listMachines,
  removeMachine,
  renameMachine,
} from "@/lib/vault-sync/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;
  return Response.json({ machines: await listMachines() });
}

export async function POST(req: NextRequest) {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  let body: { action?: string; id?: string; label?: string };
  try {
    body = (await req.json()) as { action?: string; id?: string; label?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = body.id?.trim();
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  try {
    if (body.action === "rename") await renameMachine(id, body.label ?? "");
    else if (body.action === "remove") await removeMachine(id);
    else return Response.json({ error: "unknown_action" }, { status: 400 });
    return Response.json({ ok: true, machines: await listMachines() });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
