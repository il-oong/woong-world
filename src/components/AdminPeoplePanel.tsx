"use client";

import { useEffect, useState } from "react";

type Data = { super: string; extras: string[] };

export function AdminPeoplePanel() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/list");
      const d = (await res.json().catch(() => ({}))) as Partial<Data> & {
        error?: string;
      };
      if (!res.ok) {
        setErr(d.error ?? `http_${res.status}`);
        return;
      }
      setData({ super: d.super ?? "", extras: d.extras ?? [] });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    const e = newEmail.trim();
    if (!e || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      const d = (await res.json().catch(() => ({}))) as Partial<Data> & {
        error?: string;
      };
      if (!res.ok) {
        setErr(humanError(d.error));
        return;
      }
      setNewEmail("");
      setData({ super: d.super ?? "", extras: d.extras ?? [] });
      setErr(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (email: string) => {
    if (!confirm(`"${email}" 관리자 권한을 제거할까요?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/list?email=${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      const d = (await res.json().catch(() => ({}))) as Partial<Data> & {
        error?: string;
      };
      if (!res.ok) {
        setErr(humanError(d.error));
        return;
      }
      setData({ super: d.super ?? "", extras: d.extras ?? [] });
      setErr(null);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <p className="text-xs text-[var(--muted)]">불러오는 중...</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          기본 관리자 (환경변수)
        </p>
        <p className="mt-1 font-mono text-sm">{data.super}</p>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          ADMIN_EMAIL 환경변수로 지정 — 여기서는 제거할 수 없습니다.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
          추가 관리자
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {data.extras.length === 0 ? (
            <li className="text-xs text-[var(--muted)]">
              아직 추가된 관리자가 없어요.
            </li>
          ) : (
            data.extras.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-sm"
              >
                <span className="font-mono">{email}</span>
                <button
                  type="button"
                  onClick={() => void remove(email)}
                  disabled={busy}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-40"
                >
                  제거
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="추가할 Google 이메일 (Enter)"
            className="flex-1 rounded-md border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !newEmail.trim()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            추가
          </button>
        </div>

        {err && (
          <p className="mt-3 text-xs text-rose-300">{err}</p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          상대가 그 Google 계정으로 비서에 로그인하면 즉시 관리자 권한 적용. 이메일 주소는 Google 로그인 시 사용하는 주소와 정확히 일치해야 합니다.
        </p>
      </section>
    </div>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case "invalid_email":
      return "이메일 형식이 올바르지 않습니다.";
    case "cannot_remove_super":
      return "기본 관리자는 환경변수에서만 변경할 수 있어요.";
    case "storage_not_configured":
      return "Redis 연결이 안 되어 있어 저장할 수 없습니다.";
    case "not_admin":
      return "관리자 권한이 필요합니다.";
    default:
      return code ?? "알 수 없는 오류";
  }
}
