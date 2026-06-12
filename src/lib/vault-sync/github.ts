import { getConfig, getGithubTarget } from "./config";
import { logInfo, logWarn } from "./logger";
import type { VaultBackup, VaultCommit } from "./git";

/**
 * GitHub REST engine — the deploy-time counterpart to the local git-CLI engine.
 *
 * On Vercel there is no working tree to commit, but the notes already live in
 * the repo's `obsidian/` folder. Backups become git tags, restore rewrites the
 * folder via the Trees API, and history reads the commit log — all over HTTPS,
 * no filesystem or git binary required.
 */

const API = "https://api.github.com";
const BACKUP_PREFIX = "vault-backup-";
const SAFETY_PREFIX = "vault-safety-";
const TAG_SAFE = /^[A-Za-z0-9._/-]+$/;

const WRITE_TOKEN_HINT =
  "쓰기 권한이 있는 GITHUB_TOKEN이 필요합니다 (Fine-grained: Contents read/write, classic: repo). Vercel 환경변수에 추가하세요.";

class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

function headers(withBody: boolean): HeadersInit {
  const { token } = getGithubTarget();
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (withBody) h["Content-Type"] = "application/json";
  return h;
}

async function ghJson<T>(path: string): Promise<T> {
  const { owner, repo } = getGithubTarget();
  const res = await fetch(`${API}/repos/${owner}/${repo}${path}`, {
    headers: headers(false),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

async function ghWrite<T>(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
): Promise<T> {
  const { owner, repo, token } = getGithubTarget();
  if (!token) throw new GithubError(WRITE_TOKEN_HINT, 401);
  const res = await fetch(`${API}/repos/${owner}/${repo}${path}`, {
    method,
    headers: headers(true),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}

async function toError(res: Response): Promise<GithubError> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    detail = body?.message ?? "";
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) {
    return new GithubError(WRITE_TOKEN_HINT, res.status);
  }
  return new GithubError(detail || `GitHub API ${res.status}`, res.status);
}

// ── Tag-name <-> date helpers (timestamp is encoded in the name) ──

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function dateFromTag(tag: string, prefix: string): number {
  const m = tag
    .slice(prefix.length)
    .match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return Math.floor(dt.getTime() / 1000);
}

// ── Read operations ──

type RefObject = { ref: string; object: { sha: string; type: string } };

export async function ghListBackups(): Promise<VaultBackup[]> {
  let refs: RefObject[];
  try {
    refs = await ghJson<RefObject[]>(
      `/git/matching-refs/tags/${BACKUP_PREFIX}`,
    );
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return [];
    throw e;
  }
  return refs
    .map((r) => {
      const tag = r.ref.replace("refs/tags/", "");
      return {
        tag,
        date: dateFromTag(tag, BACKUP_PREFIX),
        subject: "백업 스냅샷",
        hash: r.object.sha.slice(0, 7),
      };
    })
    .sort((a, b) => b.date - a.date);
}

type CommitListItem = {
  sha: string;
  commit: { author: { name: string; date: string }; message: string };
};

export async function ghRecentCommits(limit = 30): Promise<VaultCommit[]> {
  const { branch } = getGithubTarget();
  const { vaultPath } = getConfig();
  const list = await ghJson<CommitListItem[]>(
    `/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(
      vaultPath,
    )}&per_page=${limit}`,
  );
  return list.map((c) => ({
    hash: c.sha,
    short: c.sha.slice(0, 7),
    author: c.commit.author?.name ?? "—",
    date: Math.floor(Date.parse(c.commit.author?.date ?? "") / 1000) || 0,
    subject: (c.commit.message ?? "").split("\n")[0],
  }));
}

export async function ghVaultExists(): Promise<boolean> {
  const { owner, repo, branch } = getGithubTarget();
  const { vaultPath } = getConfig();
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
      vaultPath,
    )}?ref=${encodeURIComponent(branch)}`,
    { headers: headers(false), cache: "no-store" },
  );
  return res.ok;
}

export type GithubSummary = {
  branch: string;
  repo: string;
  vaultPath: string;
  vaultExists: boolean;
  canWrite: boolean;
  backupCount: number;
  lastNoteCommit: { subject: string; date: number } | null;
};

export async function ghSummary(): Promise<GithubSummary> {
  const { owner, repo, branch, token } = getGithubTarget();
  const { vaultPath } = getConfig();
  const [exists, backups, commits] = await Promise.all([
    ghVaultExists().catch(() => false),
    ghListBackups().catch(() => [] as VaultBackup[]),
    ghRecentCommits(1).catch(() => [] as VaultCommit[]),
  ]);
  return {
    branch,
    repo: `${owner}/${repo}`,
    vaultPath,
    vaultExists: exists,
    canWrite: token.length > 0,
    backupCount: backups.length,
    lastNoteCommit: commits[0]
      ? { subject: commits[0].subject, date: commits[0].date }
      : null,
  };
}

export type BackupEntry = { path: string; bytes: number };

/** 백업 태그 시점의 vault 폴더 파일 목록(경로+크기). */
export async function ghBackupContents(tag: string): Promise<BackupEntry[]> {
  if (!TAG_SAFE.test(tag)) throw new GithubError("invalid_tag", 400);
  const { vaultPath } = getConfig();
  const ref = await ghJson<{ object: { sha: string; type: string } }>(
    `/git/ref/tags/${tag}`,
  );
  let commitSha = ref.object.sha;
  if (ref.object.type === "tag") {
    const t = await ghJson<{ object: { sha: string } }>(
      `/git/tags/${ref.object.sha}`,
    );
    commitSha = t.object.sha;
  }
  const commit = await ghJson<{ tree: { sha: string } }>(
    `/git/commits/${commitSha}`,
  );
  const tree = await ghJson<{
    tree: { path: string; type: string; size?: number }[];
    truncated: boolean;
  }>(`/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree
    .filter((e) => e.type === "blob" && underVault(e.path, vaultPath))
    .map((e) => ({ path: e.path, bytes: e.size ?? 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ── Write operations ──

async function branchHead(): Promise<{ sha: string; treeSha: string }> {
  const { branch } = getGithubTarget();
  const head = await ghJson<{ sha: string; commit: { tree: { sha: string } } }>(
    `/commits/${encodeURIComponent(branch)}`,
  );
  return { sha: head.sha, treeSha: head.commit.tree.sha };
}

/** Create a lightweight backup tag at the branch HEAD. */
export async function ghCreateBackup(): Promise<{ tag: string; pushed: boolean }> {
  const tag = `${BACKUP_PREFIX}${stamp(new Date())}`;
  const { sha } = await branchHead();
  await ghWrite("POST", "/git/refs", { ref: `refs/tags/${tag}`, sha });
  logInfo(`백업 생성(GitHub): ${tag}`);
  return { tag, pushed: true };
}

type TreeEntry = {
  path: string;
  mode: string;
  type: string;
  sha: string | null;
};

function underVault(path: string, vaultPath: string): boolean {
  return path === vaultPath || path.startsWith(`${vaultPath}/`);
}

async function vaultBlobs(treeSha: string, vaultPath: string): Promise<TreeEntry[]> {
  const tree = await ghJson<{ tree: TreeEntry[]; truncated: boolean }>(
    `/git/trees/${treeSha}?recursive=1`,
  );
  if (tree.truncated) throw new GithubError("tree_too_large", 422);
  return tree.tree.filter(
    (e) => e.type === "blob" && underVault(e.path, vaultPath),
  );
}

/**
 * Restore the `obsidian/` folder to a backup tag's state via the Trees API.
 * Scoped to the vault path (app code untouched). A safety tag is created at the
 * current HEAD first so the restore can itself be undone.
 */
export async function ghRestoreToTag(
  tag: string,
): Promise<{ safetyTag: string; committed: boolean }> {
  if (!TAG_SAFE.test(tag)) throw new GithubError("invalid_tag", 400);
  const known = await ghListBackups();
  if (!known.some((b) => b.tag === tag)) throw new GithubError("unknown_tag", 400);

  const { branch } = getGithubTarget();
  const { vaultPath } = getConfig();

  // Resolve the tag to its commit (deref annotated tags).
  const ref = await ghJson<{ object: { sha: string; type: string } }>(
    `/git/ref/tags/${tag}`,
  );
  let tagCommitSha = ref.object.sha;
  if (ref.object.type === "tag") {
    const t = await ghJson<{ object: { sha: string } }>(
      `/git/tags/${ref.object.sha}`,
    );
    tagCommitSha = t.object.sha;
  }
  const tagCommit = await ghJson<{ tree: { sha: string } }>(
    `/git/commits/${tagCommitSha}`,
  );

  const head = await branchHead();
  const [tagFiles, headFiles] = await Promise.all([
    vaultBlobs(tagCommit.tree.sha, vaultPath),
    vaultBlobs(head.treeSha, vaultPath),
  ]);

  // Overlay the tagged folder onto the current tree; delete files that the
  // tag no longer has (sha:null) so the restore is exact, not just additive.
  const tagPaths = new Set(tagFiles.map((e) => e.path));
  const entries: TreeEntry[] = tagFiles.map((e) => ({
    path: e.path,
    mode: e.mode,
    type: "blob",
    sha: e.sha,
  }));
  for (const e of headFiles) {
    if (!tagPaths.has(e.path)) {
      entries.push({ path: e.path, mode: e.mode, type: "blob", sha: null });
    }
  }

  // 1. Safety snapshot of the current state.
  const safetyTag = `${SAFETY_PREFIX}${stamp(new Date())}`;
  await ghWrite("POST", "/git/refs", {
    ref: `refs/tags/${safetyTag}`,
    sha: head.sha,
  });

  if (entries.length === 0) {
    logWarn(`복원(GitHub): 변경 없음 — ${tag}`);
    return { safetyTag, committed: false };
  }

  // 2. Build the new tree and commit it onto the branch.
  const newTree = await ghWrite<{ sha: string }>("POST", "/git/trees", {
    base_tree: head.treeSha,
    tree: entries,
  });
  const newCommit = await ghWrite<{ sha: string }>("POST", "/git/commits", {
    message: `vault: restore obsidian/ to ${tag}`,
    tree: newTree.sha,
    parents: [head.sha],
  });
  await ghWrite("PATCH", `/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
    force: false,
  });
  logInfo(`복원(GitHub): ${tag} (안전 스냅샷 ${safetyTag})`);
  return { safetyTag, committed: true };
}
