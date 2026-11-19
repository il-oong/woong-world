"use client";

import { useEffect, useRef, useState } from "react";

const PRESETS = [
  { id: "spam", label: "스팸" },
  { id: "social", label: "소셜(SNS)" },
  { id: "promotions", label: "프로모션" },
  { id: "unread", label: "안 읽음" },
] as const;

type Preview = { count: number; capped: boolean; token: string | null };
type Job = {
  id: string;
  status: "running" | "done" | "failed";
  total: number;
  processed: number;
  error?: string;
};

/** From this many messages on, the user must type the count to confirm. */
const LARGE = 1000;

const ERRORS: Record<string, string> = {
  not_connected: "구글 계정 연결이 필요합니다.",
  condition_required: "삭제 조건을 선택하거나 입력해 주세요.",
  invalid_query: "검색 조건이 올바르지 않습니다.",
  preview_expired: "확인 시간이 지났습니다. 다시 조회해 주세요.",
  count_mismatch: "확인한 메일 수가 일치하지 않습니다.",
  job_in_progress: "이미 진행 중인 삭제 작업이 있습니다.",
  gmail_failed: "Gmail 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function MailBulkTrash() {
  const [preset, setPreset] = useState<string>("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const fail = (code?: string) =>
    setError(ERRORS[code ?? ""] ?? "요청을 처리하지 못했습니다.");

  async function post(payload: unknown) {
    const res = await fetch("/api/mail/bulk-trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  }

  async function doPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
    setJob(null);
    setTyped("");
    const { ok, data } = await post({ action: "preview", preset, query });
    setBusy(false);
    if (!ok) return fail(data.error as string);
    setPreview(data as unknown as Preview);
  }

  function poll(jobId: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const res = await fetch(`/api/mail/bulk-trash?jobId=${jobId}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { job: j } = (await res.json()) as { job: Job };
      setJob(j);
      if (j.status !== "running" && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          new Notification(
            j.status === "done" ? "메일 삭제 완료" : "메일 삭제 실패",
            {
              body: `${j.processed.toLocaleString()} / ${j.total.toLocaleString()}개 처리`,
            },
          );
        }
      }
    }, 2000);
  }

  async function start() {
    if (!preview?.token) return;
    setBusy(true);
    setError(null);
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
    const { ok, data } = await post({
      action: "start",
      token: preview.token,
      confirmCount: preview.count,
    });
    setBusy(false);
    if (!ok) return fail(data.error as string);
    const j = data.job as Job;
    setJob(j);
    setPreview(null);
    poll(j.id);
  }

  const large = (preview?.count ?? 0) >= LARGE;
  const confirmed = !large || typed.trim() === String(preview?.count);
  const running = job?.status === "running";
  const pct =
    job && job.total ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <div className="space-y-6 rounded-lg border border-[var(--border)] p-5 text-sm">
      <div>
        <p className="mb-2 text-xs text-[var(--muted)]">삭제 조건</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy || running}
              onClick={() => setPreset(preset === p.id ? "" : p.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                preset === p.id
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy || running}
          maxLength={300}
          placeholder="추가 Gmail 검색 (예: from:news@example.com older_than:1y)"
          className="mt-3 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={doPreview}
          disabled={busy || running || (!preset && !query.trim())}
          className="mt-3 rounded bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black disabled:opacity-40"
        >
          {busy && !preview ? "조회 중…" : "대상 메일 조회"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {preview && preview.count === 0 && (
        <p className="text-xs text-[var(--muted)]">
          조건에 해당하는 메일이 없습니다. 삭제할 대상이 없어요.
        </p>
      )}

      {preview && preview.count > 0 && (
        <div className="space-y-3 rounded border border-yellow-500/40 p-4">
          <p className="font-medium">
            ⚠️ {preview.count.toLocaleString()}개의 메일이 휴지통으로 이동됩니다.
            {preview.capped && " (1회 처리 한도입니다. 나머지는 다시 실행하세요.)"}
          </p>
          <p className="text-xs text-[var(--muted)]">
            휴지통의 메일은 30일 후 영구 삭제되며, 그 전에는 복구할 수 있습니다.
            삭제는 백그라운드에서 진행됩니다.
          </p>
          {large && (
            <label className="block text-xs">
              확인을 위해 메일 수 <b>{preview.count}</b>를 입력하세요
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-3 py-2"
              />
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={start}
              disabled={busy || !confirmed}
              className="rounded bg-red-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {busy ? "시작 중…" : "삭제 시작"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded border border-[var(--border)] px-4 py-2 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {job && (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded bg-[var(--border)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-[var(--muted)]" role="status">
            {job.status === "running" &&
              `삭제 중… ${job.processed.toLocaleString()} / ${job.total.toLocaleString()} (${pct}%)`}
            {job.status === "done" &&
              `완료: ${job.processed.toLocaleString()}개를 휴지통으로 옮겼어요.`}
            {job.status === "failed" &&
              `실패: ${job.processed.toLocaleString()} / ${job.total.toLocaleString()}개 처리 후 중단되었습니다. 다시 조회해 이어서 진행하세요.`}
          </p>
        </div>
      )}
    </div>
  );
}
