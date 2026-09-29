"use client";

import { useEffect, useState } from "react";
import type { Memo } from "@/lib/memos";

type ListResponse = { memos: Memo[] };

const ERROR_LABEL: Record<string, string> = {
  not_connected: "세션이 만료됐어요. 새로고침 후 다시 로그인해주세요.",
  limit_exceeded: "메모는 최대 200개까지 저장할 수 있어요.",
  missing_text: "메모 내용을 입력해주세요.",
  text_too_long: "메모가 너무 길어요 (최대 5,000자).",
  not_found: "메모를 찾을 수 없어요. 새로고침해주세요.",
  invalid_json: "요청 형식 오류가 발생했어요.",
  load_failed: "메모를 불러오지 못했어요.",
};

function errorMessage(err: string): string {
  return ERROR_LABEL[err] ?? "문제가 발생했어요. 잠시 후 다시 시도해주세요.";
}

function formatTs(ts: number, now: Date = new Date()): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `오늘 ${hm}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `어제 ${hm}`;

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

export function MemoApp() {
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    try {
      const res = await fetch("/api/memos");
      if (res.status === 401) {
        setErr("not_connected");
        setMemos([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<ListResponse> & {
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? `http_${res.status}`);
        setMemos([]);
        return;
      }
      setMemos(data.memos ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
      setMemos([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    const t = newText.trim();
    if (!t) return;
    setAdding(true);
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), text: t }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      setNewTitle("");
      setNewText("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  const togglePin = async (memo: Memo) => {
    setPendingId(memo.id);
    try {
      const res = await fetch(`/api/memos/${encodeURIComponent(memo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !memo.pinned }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const saveEdit = async (memo: Memo) => {
    const title = editTitle.trim();
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      return;
    }
    if (title === memo.title && text === memo.text) {
      setEditingId(null);
      return;
    }
    setPendingId(memo.id);
    try {
      const res = await fetch(`/api/memos/${encodeURIComponent(memo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (memo: Memo) => {
    if (!confirm(`"${memo.title || memo.text.slice(0, 20)}" 삭제할까요?`)) return;
    setPendingId(memo.id);
    try {
      const res = await fetch(`/api/memos/${encodeURIComponent(memo.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      await load();
    } finally {
      setPendingId(null);
    }
  };

  if (memos === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="animate-pulse text-xs text-[var(--muted)]">
          불러오는 중...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          biseo / memo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">메모</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {memos.length === 0 ? "메모가 비어있어요." : `전체 ${memos.length}개`}
        </p>
      </header>

      {err === "storage_not_configured" ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Redis(UPSTASH)가 연결되어 있지 않아 저장이 동작하지 않습니다.
        </div>
      ) : (
        err && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {errorMessage(err)}
          </div>
        )
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="제목 (선택)"
          maxLength={200}
          className="rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
        />
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="메모 내용 (⌘/Ctrl+Enter로 저장)"
          maxLength={5_000}
          rows={3}
          className="resize-y rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={adding || !newText.trim()}
          className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {adding ? "..." : "메모 추가"}
        </button>
      </div>

      {memos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-xs text-[var(--muted)]">
          첫 메모를 추가해보세요.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {memos.map((memo) => {
            const isEditing = editingId === memo.id;
            return (
              <li
                key={memo.id}
                className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
              >
                {isEditing ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="제목 (선택)"
                      maxLength={200}
                      className="rounded border border-[var(--accent)]/60 bg-black/30 px-2 py-1 text-sm text-foreground focus:outline-none"
                    />
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void saveEdit(memo);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      maxLength={5_000}
                      rows={4}
                      className="resize-y rounded border border-[var(--accent)]/60 bg-black/30 px-2 py-1 text-sm text-foreground focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-foreground"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(memo)}
                        disabled={pendingId === memo.id}
                        className="rounded bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-black disabled:opacity-40"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(memo.id);
                          setEditTitle(memo.title);
                          setEditText(memo.text);
                        }}
                        className="min-w-0 flex-1 text-left"
                        title="클릭해서 편집"
                      >
                        {memo.title && (
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {memo.title}
                          </span>
                        )}
                        <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-foreground/90">
                          {memo.text}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void togglePin(memo)}
                          disabled={pendingId === memo.id}
                          aria-label={memo.pinned ? "고정 해제" : "고정"}
                          title={memo.pinned ? "고정 해제" : "상단 고정"}
                          className={`rounded p-1 transition disabled:opacity-40 ${
                            memo.pinned
                              ? "text-[var(--accent)]"
                              : "text-[var(--muted)] hover:text-foreground"
                          }`}
                        >
                          📌
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(memo)}
                          disabled={pendingId === memo.id}
                          aria-label="삭제"
                          className="shrink-0 rounded p-1 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      <time dateTime={new Date(memo.updatedAt).toISOString()}>
                        {formatTs(memo.updatedAt, now)}
                      </time>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
