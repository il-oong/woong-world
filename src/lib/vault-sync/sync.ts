import {
  aheadBehind,
  commitVault,
  effectiveBranch,
  fetchRemote,
  mergeRemote,
  pushHead,
} from "./git";
import { logError, logInfo, logWarn } from "./logger";

export type SyncState = {
  /** A sync is currently running. */
  syncing: boolean;
  /** Epoch ms of the last successful sync attempt completion. */
  lastSyncAt: number | null;
  /** Human-readable summary of the last run. */
  lastResult: string | null;
  /** Last error message, or null. */
  lastError: string | null;
  /** Local commits not yet on the remote (as of last sync). */
  ahead: number;
  /** Remote commits not yet merged locally (as of last sync). */
  behind: number;
  /** Branch the engine syncs. */
  branch: string;
  /** Whether the tracked remote branch exists. */
  remoteExists: boolean;
  /** Conflict copies created during the last sync. */
  lastConflicts: string[];
};

type SyncGlobal = {
  vaultSyncState?: SyncState;
  vaultSyncRunning?: boolean;
  vaultSyncQueued?: boolean;
};
const g = globalThis as unknown as SyncGlobal;

function state(): SyncState {
  if (!g.vaultSyncState) {
    g.vaultSyncState = {
      syncing: false,
      lastSyncAt: null,
      lastResult: null,
      lastError: null,
      ahead: 0,
      behind: 0,
      branch: "",
      remoteExists: false,
      lastConflicts: [],
    };
  }
  return g.vaultSyncState;
}

export function getState(): SyncState {
  return { ...state() };
}

async function runSync(reason: string): Promise<void> {
  const s = state();
  const branch = await effectiveBranch();
  s.branch = branch;
  if (!branch) throw new Error("브랜치를 확인할 수 없습니다 (HEAD detached?)");

  // 1. Commit local note changes (scoped to the vault path).
  const committed = await commitVault(`vault: update notes (${reason})`);

  // 2. Fetch and merge remote changes if we are behind.
  const fetched = await fetchRemote(branch);
  if (!fetched.ok) logWarn(`fetch 경고: ${fetched.stderr}`);

  let conflicts: string[] = [];
  const ab = await aheadBehind(branch);
  if (ab.remoteExists && ab.behind > 0) {
    const merged = await mergeRemote(branch);
    conflicts = merged.conflicts;
    if (!merged.merged) throw new Error("원격 변경 병합 실패");
  }

  // 3. Push local commits (creates the branch if it doesn't exist yet).
  const ab2 = await aheadBehind(branch);
  if (!ab2.remoteExists || ab2.ahead > 0) {
    const pushed = await pushHead(branch);
    if (!pushed.ok) throw new Error(`push 실패: ${pushed.stderr}`);
  }

  // 4. Record fresh status.
  const ab3 = await aheadBehind(branch);
  s.ahead = ab3.ahead;
  s.behind = ab3.behind;
  s.remoteExists = ab3.remoteExists;
  s.lastConflicts = conflicts;
  s.lastSyncAt = Date.now();

  const parts: string[] = [];
  parts.push(committed ? "변경 커밋·푸시됨" : "로컬 변경 없음");
  if (conflicts.length > 0) parts.push(`충돌본 ${conflicts.length}개 보존`);
  s.lastResult = parts.join(" · ");
}

/**
 * Run a sync. Serialized: if a sync is already in flight, the request is
 * coalesced so a single follow-up run captures whatever changed in the meantime.
 */
export async function syncNow(reason: string): Promise<SyncState> {
  if (g.vaultSyncRunning) {
    g.vaultSyncQueued = true;
    return getState();
  }
  g.vaultSyncRunning = true;
  const s = state();
  s.syncing = true;
  s.lastError = null;
  try {
    logInfo(`동기화 시작 (${reason})`);
    await runSync(reason);
    logInfo(`동기화 완료: ${s.lastResult ?? ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed";
    s.lastError = msg;
    logError(`동기화 실패: ${msg}`);
  } finally {
    s.syncing = false;
    g.vaultSyncRunning = false;
  }

  if (g.vaultSyncQueued) {
    g.vaultSyncQueued = false;
    return syncNow("queued");
  }
  return getState();
}
