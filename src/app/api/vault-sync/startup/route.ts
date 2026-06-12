import { type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { guardVaultSync } from "@/lib/vault-sync/guard";
import { isLocalRuntime } from "@/lib/vault-sync/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STARTUP_FILENAME = "ObsidianVaultSync.vbs";

function winStartupFolder(): string {
  const appData =
    process.env.APPDATA ||
    path.join(os.homedir(), "AppData", "Roaming");
  return path.join(
    appData,
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
}

function vbsContent(): string {
  const nodeExe = process.execPath;
  const daemonPath = path.join(process.cwd(), "vault-sync-daemon.mjs");
  return (
    [
      "' Obsidian VaultSync 자동 동기화 데모",
      "' 이 파일을 삭제하면 시작 프로그램이 해제됩니다.",
      `Set sh = CreateObject("WScript.Shell")`,
      `sh.Run """${nodeExe}"" ""${daemonPath}""", 0`,
    ].join("\r\n") + "\r\n"
  );
}

type StartupPayload =
  | { supported: true; registered: boolean; file?: string }
  | { supported: false; reason: string };

export async function GET(): Promise<Response> {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  if (!isLocalRuntime())
    return Response.json({ supported: false, reason: "deploy" });
  if (process.platform !== "win32")
    return Response.json({
      supported: false,
      reason: `platform:${process.platform}`,
    });

  const file = path.join(winStartupFolder(), STARTUP_FILENAME);
  try {
    await fs.access(file);
    return Response.json({ supported: true, registered: true, file });
  } catch {
    return Response.json({ supported: true, registered: false });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const blocked = await guardVaultSync();
  if (blocked) return blocked;

  if (!isLocalRuntime())
    return Response.json({ error: "deploy_only" }, { status: 400 });
  if (process.platform !== "win32")
    return Response.json({ error: "windows_only" }, { status: 400 });

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const folder = winStartupFolder();
  const file = path.join(folder, STARTUP_FILENAME);

  try {
    if (body.action === "register") {
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(file, vbsContent(), "utf8");
      return Response.json({ ok: true, registered: true, file });
    }
    if (body.action === "unregister") {
      await fs.unlink(file).catch(() => {});
      return Response.json({ ok: true, registered: false });
    }
    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
