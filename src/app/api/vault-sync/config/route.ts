import { type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { guardVaultSync } from "@/lib/vault-sync/guard";
import { getConfig, isLocalRuntime } from "@/lib/vault-sync/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENV_FILE = path.join(process.cwd(), ".env.local");

async function readEnvLocal(): Promise<string> {
  try {
    return await fs.readFile(ENV_FILE, "utf8");
  } catch {
    return "";
  }
}

function setEnvKey(content: string, key: string, value: string): string {
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => {
    const t = l.trim();
    return t.startsWith(`${key}=`) || t.startsWith(`# ${key}=`);
  });
  const newLine = value.trim() ? `${key}=${value.trim()}` : `# ${key}=`;
  if (idx >= 0) lines[idx] = newLine;
  else lines.push(newLine);
  return lines.join("\n");
}

export async function GET() {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;
  const cfg = getConfig();
  return Response.json({ externalPath: cfg.externalPath });
}

export async function POST(req: NextRequest) {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  if (!isLocalRuntime())
    return Response.json({ error: "local_only" }, { status: 400 });

  let body: { externalPath?: string };
  try {
    body = (await req.json()) as { externalPath?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const externalPath = (body.externalPath ?? "").trim();

  try {
    let content = await readEnvLocal();
    content = setEnvKey(content, "VAULT_SYNC_EXTERNAL_PATH", externalPath);
    // 마지막 줄에 개행 보장
    if (!content.endsWith("\n")) content += "\n";
    await fs.writeFile(ENV_FILE, content, "utf8");
    return Response.json({ ok: true, externalPath });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "write_failed" },
      { status: 500 },
    );
  }
}
