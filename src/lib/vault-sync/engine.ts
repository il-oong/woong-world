import { promises as fs } from "node:fs";
import { getConfig, isLocalRuntime } from "./config";
import {
  createBackupTag,
  currentBranch,
  effectiveBranch,
  hasVaultChanges,
  isGitRepo,
  listBackups,
  recentCommits,
  restoreToTag,
  type VaultBackup,
  type VaultCommit,
} from "./git";
import {
  ghCreateBackup,
  ghListBackups,
  ghRecentCommits,
  ghRestoreToTag,
  ghSummary,
} from "./github";
import { recentLogs } from "./logger";
import { getState, syncNow, type SyncState } from "./sync";
import { watcherActive } from "./watcher";

/**
 * Engine facade. Locally we drive the git CLI against the working tree (the
 * only place that can pick up the user's live Obsidian edits). On a deploy we
 * drive the GitHub REST API against the repo, where the notes already live.
 * Routes call these and never branch on the runtime themselves.
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

export async function engineStatus(): Promise<StatusPayload> {
  if (isLocalRuntime()) {
    if (!(await isGitRepo())) {
      return {
        available: false,
        reason: "no_git",
        message: "git 저장소가 아닙니다.",
      };
    }
    const cfg = getConfig();
    const [branch, checkedOut, dirty, vaultExists] = await Promise.all([
      effectiveBranch(),
      currentBranch(),
      hasVaultChanges(),
      pathExists(cfg.vaultAbsPath),
    ]);
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
    };
  }

  const sum = await ghSummary();
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
  };
}

export async function engineListBackups(): Promise<VaultBackup[]> {
  return isLocalRuntime() ? listBackups() : ghListBackups();
}

export async function engineCreateBackup(): Promise<{
  tag: string;
  pushed: boolean;
}> {
  return isLocalRuntime() ? createBackupTag() : ghCreateBackup();
}

export async function engineCommits(limit = 30): Promise<VaultCommit[]> {
  return isLocalRuntime() ? recentCommits(limit) : ghRecentCommits(limit);
}

export async function engineRestore(
  tag: string,
): Promise<{ safetyTag: string; committed: boolean }> {
  return isLocalRuntime() ? restoreToTag(tag) : ghRestoreToTag(tag);
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
    branch: getGithubBranch(),
    remoteExists: true,
    lastConflicts: [],
  };
}

function getGithubBranch(): string {
  return getConfig().branchOverride || "main";
}
