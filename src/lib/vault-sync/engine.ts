import { promises as fs } from "node:fs";
import os from "node:os";
import { getConfig, isLocalRuntime } from "./config";
import {
  backupContents,
  commitVault,
  createBackupTag,
  currentBranch,
  effectiveBranch,
  hasVaultChanges,
  isGitRepo,
  listBackups,
  recentCommits,
  restoreToTag,
  type BackupEntry,
  type VaultBackup,
  type VaultCommit,
} from "./git";
import {
  ghBackupContents,
  ghCreateBackup,
  ghListBackups,
  ghRecentCommits,
  ghRestoreToTag,
  ghSummary,
} from "./github";
import { recentLogs } from "./logger";
import { assertVaultDir, mirrorDir } from "./mirror";
import {
  listMachines,
  registerMachine,
  touchMachine,
  type MachineInfo,
  type VaultMachine,
} from "./registry";
import { getState, syncNow, type SyncState } from "./sync";
import { watcherActive } from "./watcher";

/**
 * Engine facade. Locally we drive the git CLI against the working tree (and,
 * when VAULT_SYNC_EXTERNAL_PATH is set, mirror the user's real Obsidian vault in
 * and out). On a deploy we drive the GitHub REST API. Routes call these and
 * never branch on the runtime themselves.
 */

export type StatusPayload =
  | {
      available: true;
      mode: "local" | "github";
      branch: string;
      checkedOutBranch: string;
      dirty: boolean;
      vaultPath: string;
      vaultExists: boolean;
      autoEnabled: boolean;
      watcherActive: boolean;
      pullIntervalMs: number;
      state: SyncState;
      logs: ReturnType<typeof recentLogs>;
      machines: VaultMachine[];
      // local mode: 외부 보관함 정보
      externalPath?: string;
      externalExists?: boolean;
      // github mode only
      repo?: string;
      canWrite?: boolean;
      backupCount?: number;
      lastNoteCommit?: { subject: string; date: number } | null;
    }
  | { available: false; reason: string; message: string };

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function machineInfo(branch: string): MachineInfo {
  const cfg = getConfig();
  return {
    id: os.hostname() || "unknown-pc",
    label: (process.env.VAULT_SYNC_MACHINE_LABEL || "").trim() || undefined,
    path: cfg.externalPath || cfg.vaultAbsPath,
    external: cfg.externalPath.length > 0,
    branch,
    platform: process.platform,
  };
}

export async function engineStatus(): Promise<StatusPayload> {
  if (isLocalRuntime()) {
    if (!(await isGitRepo())) {
      return {
        available: false,
        reason: "no_git",
        message:
          "이 폴더는 Git 저장소가 아니어서 노트를 커밋하거나 GitHub로 보낼 수 없습니다. GitHub 저장소를 clone한 폴더에서 실행한 뒤 다시 시도하세요.",
      };
    }
    const cfg = getConfig();
    const [branch, checkedOut, dirty, vaultExists, externalExists] =
      await Promise.all([
        effectiveBranch(),
        currentBranch(),
        hasVaultChanges(),
        pathExists(cfg.vaultAbsPath),
        cfg.externalPath ? pathExists(cfg.externalPath) : Promise.resolve(false),
      ]);
    // 이 PC를 레지스트리에 등록(폴링이라 60초 스로틀).
    await touchMachine(machineInfo(branch));
    const machines = await listMachines();
    return {
      available: true,
      mode: "local",
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
      machines,
      externalPath: cfg.externalPath || undefined,
      externalExists: cfg.externalPath ? externalExists : undefined,
    };
  }

  const [sum, machines] = await Promise.all([ghSummary(), listMachines()]);
  return {
    available: true,
    mode: "github",
    branch: sum.branch,
    checkedOutBranch: sum.branch,
    dirty: false,
    vaultPath: sum.vaultPath,
    vaultExists: sum.vaultExists,
    autoEnabled: false,
    watcherActive: false,
    pullIntervalMs: 0,
    repo: sum.repo,
    canWrite: sum.canWrite,
    backupCount: sum.backupCount,
    lastNoteCommit: sum.lastNoteCommit,
    state: getState(),
    logs: recentLogs(80),
    machines,
  };
}

export async function engineListBackups(): Promise<VaultBackup[]> {
  return isLocalRuntime() ? listBackups() : ghListBackups();
}

export async function engineBackupContents(tag: string): Promise<BackupEntry[]> {
  return isLocalRuntime() ? backupContents(tag) : ghBackupContents(tag);
}

export async function engineCreateBackup(): Promise<{
  tag: string;
  pushed: boolean;
}> {
  if (!isLocalRuntime()) return ghCreateBackup();
  // 외부 보관함이 있으면 백업 직전 현재 상태를 레포로 미러링+커밋 → 백업이
  // "지금 내 보관함 상태"를 정확히 담도록 보장.
  const cfg = getConfig();
  if (cfg.externalPath) {
    await assertVaultDir(cfg.externalPath);
    const m = await mirrorDir(cfg.externalPath, cfg.vaultAbsPath);
    if (m.copied || m.deleted) await commitVault("vault: snapshot before backup");
    await registerMachine(machineInfo(await effectiveBranch()));
  }
  return createBackupTag();
}

export async function engineCommits(limit = 30): Promise<VaultCommit[]> {
  return isLocalRuntime() ? recentCommits(limit) : ghRecentCommits(limit);
}

export async function engineRestore(
  tag: string,
): Promise<{ safetyTag: string; committed: boolean }> {
  if (!isLocalRuntime()) return ghRestoreToTag(tag);
  const res = await restoreToTag(tag);
  // 복원된 레포 노트를 외부 보관함에도 반영(레포 → 보관함).
  const cfg = getConfig();
  if (cfg.externalPath && (await pathExists(cfg.externalPath))) {
    await mirrorDir(cfg.vaultAbsPath, cfg.externalPath);
  }
  return res;
}

export async function engineSync(reason: string): Promise<SyncState> {
  if (isLocalRuntime()) return syncNow(reason);
  // On a deploy there is no local working tree to push; backup is the action.
  return {
    syncing: false,
    lastSyncAt: null,
    lastResult: "이 환경에서는 ‘백업 생성’으로 스냅샷을 만드세요. (동기화는 로컬 전용)",
    lastError: null,
    ahead: 0,
    behind: 0,
    branch: getConfig().branchOverride || "main",
    remoteExists: true,
    lastConflicts: [],
  };
}
