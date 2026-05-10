"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  isValidPluginId,
  isValidRepo,
  type Plugin,
  type PluginStatus,
  type StatusLevel,
} from "@/lib/plugins";

type StatusResponse = { plugins: Plugin[]; statuses: PluginStatus[] };

const LEVEL_COLOR: Record<StatusLevel, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  unknown: "#64748b",
};

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
          {loaded ? `${plugins.length}개 등록됨` : "불러오는 중..."}
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

      {loaded && plugins.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--muted)]">
          등록된 플러그인이 없습니다. &ldquo;+ 새 플러그인&rdquo;으로 추가하세요.
        </div>
      )}

      <ul className="grid gap-3">
        {plugins.map((p) => {
          const s = statusMap.get(p.id);
          const level = s?.level ?? "unknown";
          const isPending = pendingId === p.id;
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 transition hover:border-[var(--accent)]/40"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: LEVEL_COLOR[level] }}
                aria-label={s?.label ?? "상태"}
                title={s?.label ?? "상태 확인 중"}
              />
              <Link
                href={`/plugins/${p.id}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-baseline gap-2">
                  <h2 className="truncate text-sm font-medium">{p.name}</h2>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {p.repo}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                  {s?.detail ?? p.description}
                </p>
              </Link>
              <span className="hidden font-mono text-[10px] text-[var(--muted)] sm:inline">
                {s?.label ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => void remove(p.id, p.name)}
                disabled={isPending}
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-rose-300/80 transition hover:border-rose-500/40 hover:bg-rose-500/10 disabled:opacity-40"
                title="허브에서 제거"
              >
                {isPending ? "..." : "제거"}
              </button>
            </li>
          );
        })}
      </ul>

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

function AddPluginModal({
  existingIds,
  onClose,
  onAdded,
}: {
  existingIds: string[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [pr, setPr] = useState("");
  const [url, setUrl] = useState("");
  const [accent, setAccent] = useState(PRESET_COLORS[0]);
  const [tagsInput, setTagsInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
            label="ID"
            hint="소문자/숫자/대시. 예: routine, my-plugin"
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
              onChange={(e) => setId(e.target.value.toLowerCase())}
              className={inputCls}
              placeholder="my-plugin"
              autoFocus
            />
          </Field>

          <Field label="이름">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="내 플러그인"
            />
          </Field>

          <Field label="설명 (선택)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="이 플러그인이 뭘 하는지 한 줄로"
            />
          </Field>

          <Field
            label="GitHub 레포"
            hint="owner/name"
            error={repo && !repoValid ? "owner/name 형식이어야 한다" : null}
          >
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className={inputCls}
              placeholder="il-oong/my-plugin"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="브랜치">
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
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

          <Field label="배포 URL (선택)" hint="iframe으로 임베드할 외부 URL">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
