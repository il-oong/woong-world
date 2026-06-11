import { promises as fs } from "node:fs";
import { isAdminSession } from "@/lib/admin";
import { getConfig, isLocalRuntime } from "@/lib/vault-sync/config";
import {
  currentBranch,
  effectiveBranch,
  hasVaultChanges,
  isGitRepo,
} from "@/lib/vault-sync/git";
import { recentLogs } from "@/lib/vault-sync/logger";
import { getState } from "@/lib/vault-sync/sync";
import { watcherActive } from "@/lib/vault-sync/watcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isLocalRuntime()) {
    return Response.json({
      available: false,
      reason: "deploy",
      message:
        "VaultSync는 로컬 전용입니다. 내 PC에서 `npm run dev`로 실행할 때만 동작합니다.",
    });
  }

  if (!(await isGitRepo())) {
    return Response.json({
      available: false,
      reason: "no_git",
      message: "git 저장소가 아닙니다.",
    });
  }

  const cfg = getConfig();
  const [branch, checkedOut, dirty, vaultExists] = await Promise.all([
    effectiveBranch(),
    currentBranch(),
    hasVaultChanges(),
    pathExists(cfg.vaultAbsPath),
  ]);

  return Response.json({
    available: true,
    branch,
    checkedOutBranch: checkedOut,
    dirty,
    vaultPath: cfg.vaultPath,
    vaultExists,
    autoEnabled: cfg.autoEnabled,
    watcherActive: watcherActive(),
    pullIntervalMs: cfg.pullIntervalMs,
    state: getState(),
    logs: recentLogs(80),
  });
}
