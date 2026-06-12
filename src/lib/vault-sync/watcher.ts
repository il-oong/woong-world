import fs from "node:fs";
import { getConfig, isLocalRuntime } from "./config";
import { logInfo, logWarn } from "./logger";
import { syncNow } from "./sync";

type WatcherHandle = {
  active: boolean;
  close: () => void;
};

type WatcherGlobal = { vaultSyncWatcher?: WatcherHandle };
const g = globalThis as unknown as WatcherGlobal;

export function watcherActive(): boolean {
  return g.vaultSyncWatcher?.active ?? false;
}

function shouldIgnore(file: string): boolean {
  const f = file.replace(/\\/g, "/");
  return (
    f === ".git" ||
    f.startsWith(".git/") ||
    f.includes("/.git/") ||
    f.includes("/.obsidian/") ||
    f.startsWith(".obsidian/") ||
    f.endsWith("~") ||
    f.endsWith(".tmp") ||
    f.includes("(conflict ")
  );
}

/**
 * Start the background sync engine: a debounced filesystem watcher on the vault
 * folder plus a periodic pull. Opt-in (VAULT_SYNC_ENABLED) and local-only.
 * Idempotent — safe to call across dev hot reloads.
 */
export function startWatcher(): void {
  if (!isLocalRuntime()) return;
  if (g.vaultSyncWatcher?.active) return;

  const cfg = getConfig();
  if (!cfg.autoEnabled) {
    logInfo("자동 동기화 꺼짐 — 활성화하려면 .env.local 에 VAULT_SYNC_ENABLED=1");
    return;
  }

  let debounce: NodeJS.Timeout | null = null;
  let fsWatcher: fs.FSWatcher | null = null;

  // 외부 보관함이 설정돼 있으면 그 폴더를, 아니면 레포 vault 폴더를 감시한다.
  const watchTarget = cfg.externalPath || cfg.vaultAbsPath;

  try {
    fsWatcher = fs.watch(
      watchTarget,
      { recursive: true },
      (_event, filename) => {
        if (filename && shouldIgnore(filename.toString())) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => void syncNow("file-change"), 2500);
      },
    );
    logInfo(`워처 시작 — ${watchTarget} 감시, ${cfg.pullIntervalMs}ms 주기 pull`);
  } catch (e) {
    logWarn(`워처 시작 실패: ${(e as Error).message}`);
  }

  const timer = setInterval(() => void syncNow("interval"), cfg.pullIntervalMs);

  const handle: WatcherHandle = {
    active: true,
    close: () => {
      clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      fsWatcher?.close();
      handle.active = false;
    },
  };
  g.vaultSyncWatcher = handle;

  // Pull anything that landed while we were offline.
  void syncNow("startup");
}

export function stopWatcher(): void {
  g.vaultSyncWatcher?.close();
}
