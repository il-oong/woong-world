"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isValidPluginId,
  isValidRepo,
  type Plugin,
  type PluginStatus,
} from "@/lib/plugins";
import { PluginTree, TreeAddCard, buildHubSubtitle } from "./PluginTree";

type StatusResponse = { plugins: Plugin[]; statuses: PluginStatus[] };

export function PluginsManager() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [statuses, setStatuses] = useState<PluginStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/plugins/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatusResponse;
      setPlugins(data.plugins);
      setStatuses(data.statuses);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (id: string, name: string) => {
    if (!confirm(`"${name}" 플러그인을 제거할까요? (코드는 그대로 남고 허브에서만 떨어집니다)`)) {
      return;
    }
    setPendingId(id);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `delete_failed_${res.status}`);
        return;
      }
      await refresh();
    } finally {
      setPendingId(null);
    }
  };

  const statusMap = new Map(statuses.map((s) => [s.pluginId, s]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">
          {loaded ? `${plugins.length}개 노드` : "불러오는 중..."}
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/20"
        >
          + 새 플러그인
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      )}

      <PluginTree
        plugins={plugins}
        statuses={statusMap}
        rootLabel="웅허브"
        rootSubtitle={
          loaded
            ? plugins.length === 0
              ? "비어있음 — 새 노드를 추가하세요"
              : buildHubSubtitle(plugins, statusMap)
            : "..."
        }
        cardFooter={(p) => (
          <div className="flex gap-1.5">
            <Link
              href={`/plugins/${p.id}`}
              className="flex-1 rounded-md border border-[var(--border)] px-2 py-1 text-center text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground"
            >
              열기
            </Link>
            <button
              type="button"
              onClick={() => void remove(p.id, p.name)}
              disabled={pendingId === p.id}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-rose-300/80 transition hover:border-rose-500/40 hover:bg-rose-500/10 disabled:opacity-40"
              title="허브에서 제거"
            >
              {pendingId === p.id ? "..." : "제거"}
            </button>
          </div>
        )}
        trailing={<TreeAddCard onClick={() => setAdding(true)} label="+ 새 노드" />}
      />

      {adding && (
        <AddPluginModal
          existingIds={plugins.map((p) => p.id)}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

const PRESET_COLORS = ["#7dd3fc", "#fcd34d", "#c4b5fd", "#86efac", "#fda4af", "#a78bfa", "#f472b6"];

/** Convert a free-form name into a slug. Returns "" if no usable ASCII chars. */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug;
}

type GithubUrlParts = {
  repo?: string;
  branch?: string;
  pr?: number;
};

/** Parse a GitHub URL like /owner/repo/pull/30 or /owner/repo/tree/branch. */
function parseGithubUrl(input: string): GithubUrlParts | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept bare "owner/name" too.
  const bareMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (bareMatch) return { repo: `${bareMatch[1]}/${bareMatch[2]}` };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 2) return null;
  const repo = `${segs[0]}/${segs[1].replace(/\.git$/, "")}`;
  const out: GithubUrlParts = { repo };
  if (segs[2] === "pull" && segs[3]) {
    const n = parseInt(segs[3], 10);
    if (Number.isFinite(n)) out.pr = n;
  } else if (segs[2] === "tree" && segs[3]) {
    out.branch = segs.slice(3).join("/");
  }
  return out;
}

type GithubMeta = {
  name?: string;
  description?: string;
  defaultBranch?: string;
  homepage?: string;
  openPrs?: { number: number; title: string; draft: boolean; branch: string }[];
};

function AddPluginModal({
  existingIds,
  onClose,
  onAdded,
}: {
  existingIds: string[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [ghUrl, setGhUrl] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [branchEdited, setBranchEdited] = useState(false);
  const [pr, setPr] = useState("");
  const [url, setUrl] = useState("");
  const [urlEdited, setUrlEdited] = useState(false);
  const [accent, setAccent] = useState(PRESET_COLORS[0]);
  const [tagsInput, setTagsInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<GithubMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // GitHub URL paste → fill repo / branch / pr
  useEffect(() => {
    const parsed = parseGithubUrl(ghUrl);
    if (!parsed) return;
    if (parsed.repo) setRepo(parsed.repo);
    if (parsed.branch) {
      setBranch(parsed.branch);
      setBranchEdited(true);
    }
    if (typeof parsed.pr === "number") setPr(String(parsed.pr));
  }, [ghUrl]);

  // Name → ID auto-slug (until user edits ID manually)
  useEffect(() => {
    if (idEdited) return;
    const slug = slugify(name);
    setId(slug);
  }, [name, idEdited]);

  // Repo → fetch metadata (debounced)
  useEffect(() => {
    if (!isValidRepo(repo)) {
      setMeta(null);
      setMetaError(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const res = await fetch(
          `/api/plugins/github-meta?repo=${encodeURIComponent(repo)}`,
        );
        const data = (await res.json().catch(() => ({}))) as
          | GithubMeta
          | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setMeta(null);
          setMetaError(("error" in data && data.error) || `http_${res.status}`);
          return;
        }
        setMeta(data);
      } catch (e) {
        if (!cancelled) {
          setMetaError(e instanceof Error ? e.message : "meta_failed");
        }
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [repo]);

  // Apply metadata to fields the user hasn't edited.
  useEffect(() => {
    if (!meta) return;
    if (!descriptionEdited && meta.description) {
      setDescription(meta.description);
    }
    if (!branchEdited && meta.defaultBranch && pr === "") {
      setBranch(meta.defaultBranch);
    }
    if (!urlEdited && meta.homepage) {
      setUrl(meta.homepage);
    }
    // intentionally watching meta only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const idValid = id.length === 0 || isValidPluginId(id);
  const idTaken = existingIds.includes(id);
  const repoValid = repo.length === 0 || isValidRepo(repo);

  const canSubmit =
    !busy &&
    id &&
    isValidPluginId(id) &&
    !idTaken &&
    name.trim() &&
    repo &&
    isValidRepo(repo);

  const applyPr = (n: number, branchRef: string) => {
    setPr(String(n));
    if (branchRef) {
      setBranch(branchRef);
      setBranchEdited(true);
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const prNum = pr.trim() ? parseInt(pr, 10) : null;
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: name.trim(),
          description: description.trim(),
          repo: repo.trim(),
          branch: branch.trim() || "main",
          pr: Number.isFinite(prNum) ? prNum : null,
          url: url.trim() || null,
          accent,
          tags,
          embeddable: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? `failed_${res.status}`);
        return;
      }
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-medium">새 플러그인</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-3 overflow-y-auto p-4 text-xs">
          <Field
            label="GitHub URL 붙여넣기"
            hint="레포·브랜치·PR번호를 자동으로 채워줘. 예: https://github.com/owner/repo/pull/30"
          >
            <input
              value={ghUrl}
              onChange={(e) => setGhUrl(e.target.value)}
              className={inputCls}
              placeholder="https://github.com/..."
              autoFocus
            />
          </Field>

          <div className="border-t border-[var(--border)]" />

          <Field label="이름">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="내 플러그인"
            />
          </Field>

          <Field
            label="ID"
            hint={
              !idEdited && id
                ? `이름에서 자동 생성됨 — 수정 가능`
                : "소문자/숫자/대시. 예: routine, my-plugin"
            }
            error={
              id && !idValid
                ? "잘못된 형식 (소문자, 숫자, 대시만)"
                : idTaken
                  ? "이미 존재하는 ID"
                  : null
            }
          >
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value.toLowerCase());
                setIdEdited(true);
              }}
              className={inputCls}
              placeholder="my-plugin"
            />
          </Field>

          <Field
            label="설명 (선택)"
            hint={!descriptionEdited && meta?.description ? "GitHub 설명에서 자동 채움" : undefined}
          >
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionEdited(true);
              }}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="이 플러그인이 뭘 하는지 한 줄로"
            />
          </Field>

          <Field
            label="GitHub 레포"
            hint={
              metaLoading
                ? "레포 정보 가져오는 중..."
                : metaError
                  ? undefined
                  : "owner/name"
            }
            error={
              repo && !repoValid
                ? "owner/name 형식이어야 한다"
                : metaError === "not_found"
                  ? "GitHub에서 못 찾음 — 비공개 레포라면 GITHUB_TOKEN 필요"
                  : null
            }
          >
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className={inputCls}
              placeholder="il-oong/my-plugin"
            />
          </Field>

          {meta?.openPrs && meta.openPrs.length > 0 && (
            <div className="rounded-md border border-[var(--border)] bg-black/20 p-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                열린 PR (클릭하면 PR# / 브랜치 채움)
              </p>
              <ul className="flex flex-col gap-1">
                {meta.openPrs.map((p) => (
                  <li key={p.number}>
                    <button
                      type="button"
                      onClick={() => applyPr(p.number, p.branch)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] hover:bg-white/5"
                    >
                      <span className="font-mono text-[var(--muted)]">
                        #{p.number}
                      </span>
                      <span className="truncate">{p.title}</span>
                      {p.draft && (
                        <span className="ml-auto rounded bg-amber-500/20 px-1 py-0.5 font-mono text-[9px] text-amber-300">
                          draft
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="브랜치"
              hint={
                !branchEdited && meta?.defaultBranch && pr === ""
                  ? "기본 브랜치에서 자동 채움"
                  : undefined
              }
            >
              <input
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setBranchEdited(true);
                }}
                className={inputCls}
                placeholder="main"
              />
            </Field>
            <Field label="PR # (선택)">
              <input
                value={pr}
                onChange={(e) => setPr(e.target.value.replace(/\D/g, ""))}
                className={inputCls}
                placeholder="예: 18"
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field
            label="배포 URL (선택)"
            hint={
              !urlEdited && meta?.homepage
                ? "GitHub homepage에서 자동 채움"
                : "iframe으로 임베드할 외부 URL"
            }
          >
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlEdited(true);
              }}
              className={inputCls}
              placeholder="https://my-plugin.vercel.app"
            />
          </Field>

          <Field label="태그 (콤마 구분, 선택)">
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className={inputCls}
              placeholder="체크리스트, 통계"
            />
          </Field>

          <Field label="색상">
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  className="h-7 w-7 rounded-full border-2 transition"
                  style={{
                    background: c,
                    borderColor: accent === c ? "var(--foreground)" : "transparent",
                  }}
                  aria-label={`색상 ${c}`}
                />
              ))}
            </div>
          </Field>

          {err && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
              {humanizeError(err)}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40"
          >
            {busy ? "추가 중..." : "추가"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="text-[10px] text-[var(--muted)]">{hint}</span>
      )}
      {error && <span className="text-[10px] text-amber-300">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded border border-[var(--border)] bg-black/30 px-2 py-1.5 text-xs focus:border-[var(--accent)]/50 focus:outline-none";

function humanizeError(code: string): string {
  switch (code) {
    case "duplicate_id":
      return "이미 존재하는 ID다.";
    case "invalid_id":
      return "ID 형식이 잘못됐다 (소문자/숫자/대시만, 'status'는 예약).";
    case "invalid_repo":
      return "GitHub 레포는 owner/name 형식이어야 한다.";
    case "missing_name":
      return "이름은 필수다.";
    case "redis_not_configured":
      return "Redis(UPSTASH)가 연결돼있지 않다 — UI 추가/제거가 동작하지 않는다.";
    case "forbidden":
      return "관리자 권한이 필요하다.";
    default:
      return code;
  }
}
