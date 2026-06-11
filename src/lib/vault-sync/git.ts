import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getConfig } from "./config";
import { logInfo, logWarn } from "./logger";

const exec = promisify(execFile);

/** Field separator for machine-parsed git output (unit separator, never in text). */
const SEP = "\x1f";

export const BACKUP_PREFIX = "vault-backup-";
export const SAFETY_PREFIX = "vault-safety-";

export type GitResult = { ok: boolean; stdout: string; stderr: string };

export type VaultCommit = {
  hash: string;
  short: string;
  author: string;
  date: number; // epoch seconds
  subject: string;
};

export type VaultBackup = {
  tag: string;
  date: number; // epoch seconds
  subject: string;
  hash: string;
};

export type AheadBehind = {
  ahead: number;
  behind: number;
  remoteExists: boolean;
};

/** Run git, capturing failures instead of throwing (for expected non-zero exits). */
async function gitSafe(args: string[]): Promise<GitResult> {
  const { repoRoot } = getConfig();
  try {
    const { stdout, stderr } = await exec("git", args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 32,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: (err.stderr || err.message || "git_failed").trim(),
    };
  }
}

export async function isGitRepo(): Promise<boolean> {
  const r = await gitSafe(["rev-parse", "--is-inside-work-tree"]);
  return r.ok && r.stdout.trim() === "true";
}

export async function currentBranch(): Promise<string> {
  const r = await gitSafe(["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.ok ? r.stdout.trim() : "";
}

/** Branch the engine commits/pushes to — override or the checked-out branch. */
export async function effectiveBranch(): Promise<string> {
  const { branchOverride } = getConfig();
  if (branchOverride) return branchOverride;
  return currentBranch();
}

/** True if there are uncommitted changes under the vault path. */
export async function hasVaultChanges(): Promise<boolean> {
  const { vaultPath } = getConfig();
  const r = await gitSafe(["status", "--porcelain", "--", vaultPath]);
  return r.ok && r.stdout.trim().length > 0;
}

/**
 * Stage and commit changes under the vault path only (never app code).
 * Returns true if a commit was created.
 */
export async function commitVault(message: string): Promise<boolean> {
  const { vaultPath } = getConfig();
  await gitSafe(["add", "--", vaultPath]);
  // Anything staged under vaultPath?
  const staged = await gitSafe([
    "diff",
    "--cached",
    "--name-only",
    "--",
    vaultPath,
  ]);
  if (!staged.ok || staged.stdout.trim().length === 0) return false;
  const res = await gitSafe(["commit", "-m", message, "--", vaultPath]);
  if (!res.ok) {
    logWarn(`커밋 실패: ${res.stderr}`);
    return false;
  }
  return true;
}

export async function fetchRemote(branch: string): Promise<GitResult> {
  const { remote } = getConfig();
  return gitSafe(["fetch", remote, branch]);
}

export async function aheadBehind(branch: string): Promise<AheadBehind> {
  const { remote } = getConfig();
  const ref = `${remote}/${branch}`;
  const verify = await gitSafe(["rev-parse", "--verify", "--quiet", ref]);
  if (!verify.ok || verify.stdout.trim().length === 0) {
    return { ahead: 0, behind: 0, remoteExists: false };
  }
  const rl = await gitSafe(["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
  if (!rl.ok) return { ahead: 0, behind: 0, remoteExists: true };
  const [a, b] = rl.stdout.trim().split(/\s+/);
  return {
    ahead: Number.parseInt(a, 10) || 0,
    behind: Number.parseInt(b, 10) || 0,
    remoteExists: true,
  };
}

export async function pushHead(branch: string): Promise<GitResult> {
  const { remote } = getConfig();
  return gitSafe(["push", remote, `HEAD:${branch}`]);
}

function conflictStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

function conflictCopyName(relFile: string): string {
  const dir = path.dirname(relFile);
  const base = path.basename(relFile);
  const dot = base.lastIndexOf(".");
  const stamp = conflictStamp();
  const copyBase =
    dot > 0
      ? `${base.slice(0, dot)} (conflict ${stamp})${base.slice(dot)}`
      : `${base} (conflict ${stamp})`;
  return path.posix.join(dir.replace(/\\/g, "/"), copyBase);
}

/**
 * Merge the remote branch into HEAD. On conflict, remote wins as the canonical
 * version and the local version is preserved losslessly as a `(conflict ...)`
 * sibling copy.
 */
export async function mergeRemote(
  branch: string,
): Promise<{ merged: boolean; conflicts: string[] }> {
  const { remote, repoRoot } = getConfig();
  const merge = await gitSafe([
    "merge",
    "--no-edit",
    `${remote}/${branch}`,
  ]);
  if (merge.ok) return { merged: true, conflicts: [] };

  // Identify unmerged paths.
  const u = await gitSafe(["diff", "--name-only", "--diff-filter=U"]);
  const files = u.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (files.length === 0) {
    // Merge failed for a non-conflict reason — abort to leave a clean tree.
    await gitSafe(["merge", "--abort"]);
    logWarn(`병합 실패(충돌 아님): ${merge.stderr}`);
    return { merged: false, conflicts: [] };
  }

  const conflicts: string[] = [];
  for (const f of files) {
    // Save our version (stage 2) as a conflict copy before taking theirs.
    const ours = await gitSafe(["show", `:2:${f}`]);
    if (ours.ok && ours.stdout.length > 0) {
      const copyRel = conflictCopyName(f);
      try {
        await fs.writeFile(path.join(repoRoot, copyRel), ours.stdout, "utf8");
        conflicts.push(copyRel);
      } catch (e) {
        logWarn(`충돌본 저장 실패(${copyRel}): ${(e as Error).message}`);
      }
    }
    // Take remote as canonical, then stage both the resolved file and the copy.
    await gitSafe(["checkout", "--theirs", "--", f]);
    await gitSafe(["add", "--", f]);
  }
  // Stage the conflict copies (live under the vault path).
  const { vaultPath } = getConfig();
  await gitSafe(["add", "--", vaultPath]);
  const commit = await gitSafe(["commit", "--no-edit"]);
  if (!commit.ok) {
    logWarn(`병합 커밋 실패: ${commit.stderr}`);
    return { merged: false, conflicts };
  }
  return { merged: true, conflicts };
}

export async function recentCommits(limit = 30): Promise<VaultCommit[]> {
  const { vaultPath } = getConfig();
  const fmt = ["%H", "%h", "%an", "%at", "%s"].join(SEP);
  const r = await gitSafe([
    "log",
    `-n`,
    String(limit),
    `--pretty=format:${fmt}`,
    "--",
    vaultPath,
  ]);
  if (!r.ok) return [];
  return r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, at, subject] = line.split(SEP);
      return {
        hash,
        short,
        author,
        date: Number.parseInt(at, 10) || 0,
        subject: subject ?? "",
      };
    });
}

/** Create an annotated backup tag at HEAD and push it (push is best-effort). */
export async function createBackupTag(): Promise<{ tag: string; pushed: boolean }> {
  const { remote } = getConfig();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const tag = `${BACKUP_PREFIX}${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate(),
  )}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const make = await gitSafe([
    "tag",
    "-a",
    tag,
    "-m",
    `VaultSync backup @ ${d.toISOString()}`,
  ]);
  if (!make.ok) throw new Error(make.stderr || "tag_failed");
  const push = await gitSafe(["push", remote, tag]);
  if (!push.ok) logWarn(`백업 태그 푸시 실패(로컬엔 생성됨): ${push.stderr}`);
  logInfo(`백업 생성: ${tag}`);
  return { tag, pushed: push.ok };
}

export async function listBackups(): Promise<VaultBackup[]> {
  const fmt = [
    "%(refname:short)",
    "%(creatordate:unix)",
    "%(contents:subject)",
    "%(objectname:short)",
  ].join(SEP);
  const r = await gitSafe([
    "tag",
    "-l",
    `${BACKUP_PREFIX}*`,
    "--sort=-creatordate",
    `--format=${fmt}`,
  ]);
  if (!r.ok) return [];
  return r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [tag, date, subject, hash] = line.split(SEP);
      return {
        tag,
        date: Number.parseInt(date, 10) || 0,
        subject: subject ?? "",
        hash: hash ?? "",
      };
    });
}

const TAG_SAFE = /^[A-Za-z0-9._/-]+$/;

/**
 * Restore the vault folder to a backup tag's state. Scoped to the vault path
 * (app code is never touched). A safety tag is created at the current HEAD
 * first so the restore itself can be undone.
 */
export async function restoreToTag(
  tag: string,
): Promise<{ safetyTag: string; committed: boolean }> {
  const { vaultPath, remote } = getConfig();
  if (!TAG_SAFE.test(tag)) throw new Error("invalid_tag");
  const known = await listBackups();
  if (!known.some((b) => b.tag === tag)) throw new Error("unknown_tag");

  // 1. Safety snapshot of the current state.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const safetyTag = `${SAFETY_PREFIX}${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate(),
  )}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const safety = await gitSafe([
    "tag",
    "-a",
    safetyTag,
    "-m",
    `before restore to ${tag}`,
  ]);
  if (!safety.ok) throw new Error(safety.stderr || "safety_tag_failed");
  await gitSafe(["push", remote, safetyTag]);

  // 2. Restore the vault folder to the tagged state.
  const checkout = await gitSafe(["checkout", tag, "--", vaultPath]);
  if (!checkout.ok) throw new Error(checkout.stderr || "checkout_failed");

  // 3. Commit the restored state (scoped to vault path).
  await gitSafe(["add", "--", vaultPath]);
  const staged = await gitSafe([
    "diff",
    "--cached",
    "--name-only",
    "--",
    vaultPath,
  ]);
  let committed = false;
  if (staged.ok && staged.stdout.trim().length > 0) {
    const commit = await gitSafe([
      "commit",
      "-m",
      `vault: restore obsidian/ to ${tag}`,
      "--",
      vaultPath,
    ]);
    committed = commit.ok;
    if (!commit.ok) logWarn(`복원 커밋 실패: ${commit.stderr}`);
  }
  logInfo(`복원: ${tag} (안전 스냅샷 ${safetyTag})`);
  return { safetyTag, committed };
}
