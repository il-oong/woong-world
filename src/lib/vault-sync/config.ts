import path from "node:path";

/**
 * VaultSync configuration.
 *
 * The sync target is woong-world's own repo (`process.cwd()`), syncing the
 * `obsidian/` folder. All values can be overridden via `.env.local`.
 */
export type VaultSyncConfig = {
  /** Repository root — woong-world itself. */
  repoRoot: string;
  /** Relative path of the notes folder, e.g. "obsidian". */
  vaultPath: string;
  /** Absolute path of the notes folder. */
  vaultAbsPath: string;
  /** Branch override; empty string means "use the currently checked-out branch". */
  branchOverride: string;
  /** Git remote name. */
  remote: string;
  /** Pull/merge interval for the background watcher (ms). */
  pullIntervalMs: number;
  /** Whether the background watcher auto-commits/pushes on change. Opt-in. */
  autoEnabled: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getConfig(): VaultSyncConfig {
  // process.cwd() makes Turbopack's file tracer think we read arbitrary files;
  // the engine is local-only and never bundled for Vercel, so opt out of the
  // whole-project trace it would otherwise pull in.
  const repoRoot = process.cwd();
  const vaultPath = (process.env.VAULT_SYNC_PATH || "obsidian")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return {
    repoRoot,
    vaultPath,
    vaultAbsPath: path.join(/* turbopackIgnore: true */ repoRoot, vaultPath),
    branchOverride: (process.env.VAULT_SYNC_BRANCH || "").trim(),
    remote: (process.env.VAULT_SYNC_REMOTE || "origin").trim(),
    pullIntervalMs: envInt("VAULT_SYNC_PULL_INTERVAL_MS", 15000),
    autoEnabled: envBool("VAULT_SYNC_ENABLED"),
  };
}

/**
 * VaultSync needs a local filesystem, the git CLI, and a persistent process —
 * none of which exist on Vercel's serverless runtime. On Vercel we disable the
 * engine and the dashboard shows a "run locally" notice instead.
 */
export function isLocalRuntime(): boolean {
  return process.env.VERCEL !== "1";
}
