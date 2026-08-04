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

function normalizedPath(p: string): string {
  const normalized = path.normalize(p);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameOrChildPath(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function validateExternalPath(input: string): Promise<string> {
  if (!input) return "";
  if (input.includes("\n") || input.includes("\r")) {
    throw new Error("invalid_path");
  }
  if (!path.isAbsolute(input)) {
    throw new Error("absolute_path_required");
  }

  const resolved = path.resolve(input);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error("vault_folder_not_found");
  }

  const cfg = getConfig();
  const [external, repoRoot] = await Promise.all([
    fs.realpath(resolved),
    fs.realpath(cfg.repoRoot),
  ]);
  if (isSameOrChildPath(normalizedPath(external), normalizedPath(repoRoot))) {
    throw new Error("vault_must_be_outside_project");
  }
  return external;
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

  let externalPath: string;
  try {
    externalPath = await validateExternalPath((body.externalPath ?? "").trim());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "invalid_path" },
      { status: 400 },
    );
  }

  try {
    let content = await readEnvLocal();
    content = setEnvKey(content, "VAULT_SYNC_EXTERNAL_PATH", externalPath);
    content = setEnvKey(content, "VAULT_SYNC_ENABLED", "1");
    // 마지막 줄에 개행 보장
    if (!content.endsWith("\n")) content += "\n";
    await fs.writeFile(ENV_FILE, content, "utf8");

    // Next.js does not reload .env.local for an already-running dev server.
    // Apply the new target immediately and replace the watcher bound to the old
    // directory, then preserve the same configuration for the next launch.
    process.env.VAULT_SYNC_EXTERNAL_PATH = externalPath;
    process.env.VAULT_SYNC_ENABLED = "1";
    const { restartWatcher } = await import("@/lib/vault-sync/watcher");
    restartWatcher();

    return Response.json({ ok: true, externalPath, watcherRestarted: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "write_failed" },
      { status: 500 },
    );
  }
}
