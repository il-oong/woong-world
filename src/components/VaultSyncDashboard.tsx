"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types (mirror the API responses; kept local to avoid bundling server code) ──

type SyncState = {
  syncing: boolean;
  lastSyncAt: number | null;
  lastResult: string | null;
  lastError: string | null;
  ahead: number;
  behind: number;
  branch: string;
  remoteExists: boolean;
  lastConflicts: string[];
};

type LogEntry = { ts: number; level: "info" | "warn" | "error"; msg: string };

type Machine = {
  id: string;
  label: string;
  path: string;
  external: boolean;
  branch: string;
  platform: string;
  lastSeen: number;
};

type StatusOk = {
  available: true;
  mode?: "local" | "github";
  branch: string;
  checkedOutBranch: string;
  dirty: boolean;
  vaultPath: string;
  vaultExists: boolean;
  autoEnabled: boolean;
  watcherActive: boolean;
  pullIntervalMs: number;
  state: SyncState;
  logs: LogEntry[];
  machines?: Machine[];
  // local mode: 외부 보관함
  externalPath?: string;
  externalExists?: boolean;
  // github mode only
  repo?: string;
  canWrite?: boolean;
  backupCount?: number;
  lastNoteCommit?: { subject: string; date: number } | null;
};

type StatusUnavailable = { available: false; reason: string; message: string };
type StatusError = { error: string };
type Status = StatusOk | StatusUnavailable | StatusError;

type Commit = {
  hash: string;
  short: string;
  author: string;
  date: number;
  subject: string;
};

type Backup = { tag: string; date: number; subject: string; hash: string };
type BackupFile = { path: string; bytes: number };

type Tab = "overview" | "backup" | "history" | "pc" | "logs";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "개요", icon: "🛰️" },
  { id: "backup", label: "백업·복원", icon: "💾" },
  { id: "history", label: "히스토리", icon: "🕘" },
  { id: "pc", label: "PC 관리", icon: "💻" },
  { id: "logs", label: "로그", icon: "📜" },
];

function fmtBytes(n: number): string {
  if (!n) return "0";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function platformLabel(p: string): string {
  if (p === "win32") return "Windows";
  if (p === "darwin") return "macOS";
  if (p === "linux") return "Linux";
  return p || "—";
}

// ── Helpers ──

function timeAgo(ms: number | null | undefined): string {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "방금 전";
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function fmtDate(epochSec: number): string {
  if (!epochSec) return "—";
  return new Date(epochSec * 1000).toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ── Component ──

export function VaultSyncDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<Status | null>(null);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/vault-sync/status");
      if (r.status === 403) {
        setStatus({ error: "forbidden" });
        return;
      }
      setStatus((await r.json()) as Status);
    } catch (e) {
      setStatus({ error: e instanceof Error ? e.message : "load_failed" });
    }
  }, []);

  const loadCommits = useCallback(async () => {
    try {
      const r = await fetch("/api/vault-sync/commits");
      const d = (await r.json()) as { commits?: Commit[] };
      setCommits(d.commits ?? []);
    } catch {
      setCommits([]);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const r = await fetch("/api/vault-sync/backup");
      const d = (await r.json()) as { backups?: Backup[] };
      setBackups(d.backups ?? []);
    } catch {
      setBackups([]);
    }
  }, []);

  const loadContents = useCallback(async (tag: string): Promise<BackupFile[]> => {
    const r = await fetch(`/api/vault-sync/backup?tag=${encodeURIComponent(tag)}`);
    const d = (await r.json()) as { files?: BackupFile[]; error?: string };
    if (d.error) throw new Error(d.error);
    return d.files ?? [];
  }, []);

  const manageMachine = useCallback(
    async (action: "rename" | "remove", id: string, label?: string) => {
      try {
        await fetch("/api/vault-sync/machines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id, label }),
        });
        await loadStatus();
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "machine_failed" });
      }
    },
    [loadStatus],
  );

  // Poll status while available.
  useEffect(() => {
    void loadStatus();
    const id = setInterval(() => void loadStatus(), 4000);
    return () => clearInterval(id);
  }, [loadStatus]);

  const available = status !== null && "available" in status && status.available;

  useEffect(() => {
    if (!available) return;
    if (tab === "history" && commits === null) void loadCommits();
    if (tab === "backup" && backups === null) void loadBackups();
  }, [tab, available, commits, backups, loadCommits, loadBackups]);

  const runSync = async () => {
    setBusy("sync");
    setMsg(null);
    try {
      const r = await fetch("/api/vault-sync/sync", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; state?: SyncState; error?: string };
      if (d.error) setMsg({ kind: "err", text: d.error });
      else if (d.state?.lastError)
        setMsg({ kind: "err", text: d.state.lastError });
      else setMsg({ kind: "ok", text: d.state?.lastResult ?? "동기화 완료" });
      await Promise.all([loadStatus(), loadCommits()]);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "sync_failed" });
    } finally {
      setBusy(null);
    }
  };

  const runBackup = async () => {
    setBusy("backup");
    setMsg(null);
    try {
      const r = await fetch("/api/vault-sync/backup", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; tag?: string; pushed?: boolean; error?: string };
      if (d.error) setMsg({ kind: "err", text: d.error });
      else
        setMsg({
          kind: "ok",
          text: `백업 생성: ${d.tag}${d.pushed ? " (원격 푸시됨)" : " (로컬만)"}`,
        });
      await loadBackups();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "backup_failed" });
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async (tag: string) => {
    if (
      !confirm(
        `"${tag}" 시점으로 obsidian/ 노트를 되돌립니다.\n복원 직전 상태는 안전 스냅샷으로 자동 저장됩니다. 진행할까요?`,
      )
    )
      return;
    setBusy(`restore:${tag}`);
    setMsg(null);
    try {
      const r = await fetch("/api/vault-sync/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const d = (await r.json()) as { ok?: boolean; safetyTag?: string; error?: string };
      if (d.error) setMsg({ kind: "err", text: d.error });
      else
        setMsg({
          kind: "ok",
          text: `복원 완료 · 안전 스냅샷 ${d.safetyTag}`,
        });
      await Promise.all([loadStatus(), loadCommits(), loadBackups()]);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "restore_failed" });
    } finally {
      setBusy(null);
    }
  };

  // ── Loading / unavailable states ──

  if (status === null) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-xs text-[var(--muted)]">
        불러오는 중...
      </div>
    );
  }

  if ("error" in status) {
    return (
      <Notice tone="warn">
        {status.error === "forbidden"
          ? "관리자만 접근할 수 있습니다."
          : `상태 로드 실패: ${status.error}`}
      </Notice>
    );
  }

  if (!status.available) {
    return (
      <Notice tone="info" title="로컬 전용 기능">
        {status.message}
        {status.reason === "deploy" && (
          <p className="mt-2 text-[var(--muted)]">
            터미널에서 <code className="rounded bg-black/40 px-1">npm run dev</code>{" "}
            로 woong-world를 띄운 뒤 이 페이지에 다시 접속하세요.
          </p>
        )}
      </Notice>
    );
  }

  return (
    <div>
      {/* Menu */}
      <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
              tab === t.id
                ? "bg-[var(--accent)]/15 text-foreground"
                : "text-[var(--muted)] hover:text-foreground"
            }`}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {msg && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-xs ${
            msg.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {tab === "overview" && (
        <Overview
          status={status}
          busy={busy}
          onSync={runSync}
          onBackup={runBackup}
        />
      )}
      {tab === "backup" && (
        <BackupPanel
          backups={backups}
          busy={busy}
          onBackup={runBackup}
          onRestore={runRestore}
          loadContents={loadContents}
        />
      )}
      {tab === "history" && <HistoryPanel commits={commits} />}
      {tab === "pc" && (
        <MachinesPanel
          machines={status.machines ?? []}
          onRename={(id, label) => manageMachine("rename", id, label)}
          onRemove={(id) => manageMachine("remove", id)}
        />
      )}
      {tab === "logs" && <LogsPanel logs={status.logs} />}
    </div>
  );
}

// ── Sync target banner (어느 폴더를 동기화하는지 항상 표시) ──

function SyncTargetBanner({ status }: { status: StatusOk }) {
  const hasExternal = !!status.externalPath;
  return (
    <div
      className={`rounded-xl border p-3 text-xs leading-relaxed ${
        hasExternal
          ? status.externalExists
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            : "border-rose-500/30 bg-rose-500/10 text-rose-100"
          : "border-amber-500/30 bg-amber-500/10 text-amber-100"
      }`}
    >
      <p className="mb-1 font-medium">
        {hasExternal ? "동기화 중인 옵시디언 보관함" : "현재 동기화 폴더"}
      </p>
      {hasExternal ? (
        <>
          <code className="break-all rounded bg-black/40 px-1 py-0.5">
            {status.externalPath}
          </code>
          {!status.externalExists && (
            <p className="mt-1">
              ⚠ 이 경로를 찾을 수 없습니다. 이 PC에 맞는 경로인지 확인하세요.
            </p>
          )}
          <p className="mt-1 text-[11px] opacity-80">
            이 폴더가 백업·동기화 대상입니다. 백업을 누르면 이 보관함의 현재 노트가 그대로 스냅샷됩니다.
          </p>
        </>
      ) : (
        <>
          <code className="break-all rounded bg-black/40 px-1 py-0.5">
            {"<레포>/"}
            {status.vaultPath}/
          </code>
          <p className="mt-1 text-[11px] opacity-80">
            지금은 <b>레포 안 {status.vaultPath}/ 폴더</b>만 동기화합니다. 내 실제
            옵시디언 보관함을 백업하려면 <code className="rounded bg-black/40 px-1">.env.local</code> 에{" "}
            <code className="rounded bg-black/40 px-1">VAULT_SYNC_EXTERNAL_PATH=보관함_절대경로</code>{" "}
            를 추가하세요.
          </p>
        </>
      )}
    </div>
  );
}

// ── PC 관리 ──

function MachinesPanel({
  machines,
  onRename,
  onRemove,
}: {
  machines: Machine[];
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted)]">
        같은 git 브랜치로 동기화하는 PC 목록입니다. 각 PC가 로컬에서 동기화하면 자동
        등록돼요. 같은 노트가 PC 간에 서로 오갑니다.
      </p>
      {machines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
          아직 등록된 PC가 없습니다. PC에서 <code className="rounded bg-black/40 px-1">npm run dev</code>{" "}
          로 띄우고 한 번 동기화하면 여기 나타납니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {machines.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-base">
                  💻
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.label}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {platformLabel(m.platform)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        m.external
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/5 text-[var(--muted)]"
                      }`}
                    >
                      {m.external ? "외부 보관함" : "레포 폴더"}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-[var(--muted)]">
                    {m.path}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {m.id} · 브랜치 {m.branch} · 마지막 동기화 {timeAgo(m.lastSeen)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const label = prompt("이 PC 이름", m.label);
                      if (label != null) onRename(m.id, label);
                    }}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] transition hover:border-[var(--accent)]/40"
                  >
                    이름변경
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`"${m.label}" 을 목록에서 지울까요? (노트는 안 지워짐)`))
                        onRemove(m.id);
                    }}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] text-rose-300 transition hover:border-rose-500/40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Overview ──

function Overview({
  status,
  busy,
  onSync,
  onBackup,
}: {
  status: StatusOk;
  busy: string | null;
  onSync: () => void;
  onBackup: () => void;
}) {
  if (status.mode === "github") {
    return <GithubOverview status={status} busy={busy} onBackup={onBackup} />;
  }
  const s = status.state;
  return (
    <div className="flex flex-col gap-4">
      <SyncTargetBanner status={status} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="브랜치" value={status.branch || "—"} sub={`체크아웃: ${status.checkedOutBranch || "—"}`} />
        <Stat
          label="동기화 상태"
          value={s.syncing ? "동기화 중…" : s.lastError ? "오류" : "대기"}
          tone={s.syncing ? "accent" : s.lastError ? "err" : "ok"}
          sub={`마지막: ${timeAgo(s.lastSyncAt)}`}
        />
        <Stat
          label="로컬 변경"
          value={status.dirty ? "있음" : "없음"}
          tone={status.dirty ? "accent" : "ok"}
          sub={`${status.vaultPath}/${status.vaultExists ? "" : " (폴더 없음)"}`}
        />
        <Stat
          label="원격 차이"
          value={
            s.remoteExists ? `↑${s.ahead} ↓${s.behind}` : "원격 브랜치 없음"
          }
          sub={s.lastResult ?? "—"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
        <span className="text-[var(--muted)]">자동 동기화</span>
        {status.autoEnabled ? (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
            켜짐 · {status.watcherActive ? "워처 동작" : "대기"} ·{" "}
            {Math.round(status.pullIntervalMs / 1000)}초 주기
          </span>
        ) : (
          <span className="rounded bg-white/5 px-2 py-0.5 text-[var(--muted)]">
            꺼짐 — <code className="text-foreground">.env.local</code> 에{" "}
            <code className="text-foreground">VAULT_SYNC_ENABLED=1</code>
          </span>
        )}
      </div>

      {s.lastError && (
        <Notice tone="warn">마지막 오류: {s.lastError}</Notice>
      )}
      {s.lastConflicts.length > 0 && (
        <Notice tone="info" title={`충돌본 ${s.lastConflicts.length}개 보존됨 (무손실)`}>
          <ul className="mt-1 list-disc pl-4 font-mono text-[11px]">
            {s.lastConflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSync}
          disabled={busy !== null}
          className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy === "sync" ? "동기화 중…" : "지금 동기화"}
        </button>
        <button
          type="button"
          onClick={onBackup}
          disabled={busy !== null}
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition hover:border-[var(--accent)]/40 disabled:opacity-40"
        >
          {busy === "backup" ? "백업 중…" : "백업 생성"}
        </button>
      </div>
    </div>
  );
}

// ── Overview (deployed / GitHub mode) ──

function GithubOverview({
  status,
  busy,
  onBackup,
}: {
  status: StatusOk;
  busy: string | null;
  onBackup: () => void;
}) {
  const canWrite = status.canWrite ?? false;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="저장소"
          value={status.repo ?? "—"}
          sub={`브랜치: ${status.branch || "main"}`}
        />
        <Stat
          label="노트 폴더"
          value={status.vaultExists ? `${status.vaultPath}/` : "폴더 없음"}
          tone={status.vaultExists ? "ok" : "err"}
          sub="GitHub 저장소 기준"
        />
        <Stat
          label="백업"
          value={`${status.backupCount ?? 0}개`}
          sub="복원 가능한 스냅샷"
        />
        <Stat
          label="최근 노트 변경"
          value={timeAgo(
            status.lastNoteCommit ? status.lastNoteCommit.date * 1000 : null,
          )}
          sub={status.lastNoteCommit?.subject ?? "—"}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs leading-relaxed text-[var(--muted)]">
        <span className="text-emerald-300">원격(GitHub) 모드</span> — 이 페이지는
        배포본에서 GitHub API로 직접 동작합니다. <b className="text-foreground">백업 생성</b>·
        <b className="text-foreground">복원</b>·<b className="text-foreground">히스토리</b>가
        바로 작동합니다. 내 PC의 옵시디언 편집을 올리는 <b>실시간 동기화</b>는 로컬
        (<code className="rounded bg-black/40 px-1">npm run dev</code>)에서만 가능합니다.
      </div>

      {!canWrite && (
        <Notice tone="warn" title="백업·복원에는 쓰기 토큰이 필요합니다">
          Vercel 환경변수에 쓰기 권한이 있는{" "}
          <code className="rounded bg-black/40 px-1">GITHUB_TOKEN</code> 을 추가하세요
          (Fine-grained: Contents read/write, classic: repo). 토큰이 없으면 히스토리
          조회만 가능합니다.
        </Notice>
      )}

      <button
        type="button"
        onClick={onBackup}
        disabled={busy !== null || !canWrite}
        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy === "backup" ? "백업 중…" : "백업 생성 (복원 지점 만들기)"}
      </button>
    </div>
  );
}

// ── Backup / Restore ──

function BackupPanel({
  backups,
  busy,
  onBackup,
  onRestore,
  loadContents,
}: {
  backups: Backup[] | null;
  busy: string | null;
  onBackup: () => void;
  onRestore: (tag: string) => void;
  loadContents: (tag: string) => Promise<BackupFile[]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBackup}
        disabled={busy !== null}
        className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy === "backup" ? "백업 중…" : "+ 새 백업 (태그 스냅샷)"}
      </button>

      {backups === null ? (
        <div className="text-xs text-[var(--muted)]">불러오는 중...</div>
      ) : backups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
          아직 백업이 없습니다. 위 버튼으로 첫 스냅샷을 만드세요.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {backups.map((b) => (
            <BackupRow
              key={b.tag}
              backup={b}
              busy={busy}
              onRestore={onRestore}
              loadContents={loadContents}
            />
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[var(--muted)]">
        복원은 obsidian/ 폴더만 해당 시점으로 되돌립니다. 복원 직전 상태는 안전
        스냅샷 태그로 자동 보존돼 언제든 되돌릴 수 있습니다. <b>내용 보기</b>로 그
        백업에 어떤 노트가 담겼는지 확인할 수 있어요.
      </p>
    </div>
  );
}

function BackupRow({
  backup: b,
  busy,
  onRestore,
  loadContents,
}: {
  backup: Backup;
  busy: string | null;
  onRestore: (tag: string) => void;
  loadContents: (tag: string) => Promise<BackupFile[]>;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && files === null && !loading) {
      setLoading(true);
      setErr(null);
      try {
        setFiles(await loadContents(b.tag));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "load_failed");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-base">
          💾
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs">{b.tag}</p>
          <p className="text-[10px] text-[var(--muted)]">
            {fmtDate(b.date)} · {b.hash}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[11px] transition hover:border-[var(--accent)]/40"
        >
          {open ? "내용 닫기" : "내용 보기"}
        </button>
        <button
          type="button"
          onClick={() => onRestore(b.tag)}
          disabled={busy !== null}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[11px] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
        >
          {busy === `restore:${b.tag}` ? "복원 중…" : "복원"}
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-black/20 p-2">
          {loading ? (
            <p className="text-[11px] text-[var(--muted)]">불러오는 중...</p>
          ) : err ? (
            <p className="text-[11px] text-rose-300">불러오기 실패: {err}</p>
          ) : files && files.length > 0 ? (
            <>
              <p className="mb-1 text-[10px] text-[var(--muted)]">
                파일 {files.length}개
              </p>
              <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
                {files.map((f) => (
                  <li key={f.path} className="flex justify-between gap-2">
                    <span className="truncate">{f.path}</span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {fmtBytes(f.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-[var(--muted)]">
              이 백업에 노트 파일이 없습니다.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ── History ──

function HistoryPanel({ commits }: { commits: Commit[] | null }) {
  if (commits === null)
    return <div className="text-xs text-[var(--muted)]">불러오는 중...</div>;
  if (commits.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
        obsidian/ 관련 커밋이 없습니다.
      </div>
    );
  return (
    <ul className="flex flex-col gap-1.5">
      {commits.map((c) => (
        <li
          key={c.hash}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs">{c.subject}</span>
            <span className="shrink-0 font-mono text-[10px] text-[var(--accent)]">
              {c.short}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            {c.author} · {fmtDate(c.date)}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ── Logs ──

function LogsPanel({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
        아직 로그가 없습니다.
      </div>
    );
  return (
    <ul className="flex flex-col gap-1 font-mono text-[11px]">
      {logs.map((l, i) => (
        <li
          key={`${l.ts}-${i}`}
          className="flex gap-2 rounded border border-[var(--border)] bg-black/20 px-2 py-1"
        >
          <span className="shrink-0 text-[var(--muted)]">
            {new Date(l.ts).toLocaleTimeString("ko-KR", { hour12: false })}
          </span>
          <span
            className={
              l.level === "error"
                ? "text-rose-300"
                : l.level === "warn"
                  ? "text-amber-300"
                  : "text-zinc-300"
            }
          >
            {l.msg}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Small UI primitives ──

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "err" | "accent";
}) {
  const valueCls =
    tone === "err"
      ? "text-rose-300"
      : tone === "accent"
        ? "text-[var(--accent)]"
        : tone === "ok"
          ? "text-emerald-300"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold ${valueCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

function Notice({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: "info" | "warn";
  title?: string;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-sky-500/30 bg-sky-500/10 text-sky-100";
  return (
    <div className={`rounded-xl border p-4 text-xs leading-relaxed ${cls}`}>
      {title && <p className="mb-1 text-sm font-medium">{title}</p>}
      {children}
    </div>
  );
}
