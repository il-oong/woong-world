"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Todo } from "@/lib/todos";

function isToday(ts: number, now = new Date()): boolean {
  const d = new Date(ts);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TodoHomeWidget() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/todos");
      if (res.status === 401) {
        setErr("not_connected");
        setTodos([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        todos?: Todo[];
        error?: string;
      };
      if (!res.ok) {
        setErr(data.error ?? `http_${res.status}`);
        setTodos([]);
        return;
      }
      setTodos(data.todos ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
      setTodos([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    const t = newText.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      if (res.ok) {
        setNewText("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (todo: Todo) => {
    setPendingId(todo.id);
    try {
      await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !todo.done }),
      });
      await load();
    } finally {
      setPendingId(null);
    }
  };

  const todayOpen = (todos ?? []).filter(
    (t) => !t.done && isToday(t.createdAt),
  );

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300">
            biseo / todo
          </p>
          <h2 className="mt-1 text-base font-medium">오늘의 할 일</h2>
        </div>
        <Link
          href="/apps/todo"
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:border-emerald-400/40 hover:text-foreground"
        >
          전체 →
        </Link>
      </div>

      {err === "not_connected" || err === "storage_not_configured" ? (
        <p className="text-xs text-[var(--muted)]">사용하려면 로그인이 필요해요.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder="새 할 일 (Enter)"
              maxLength={280}
              className="flex-1 rounded-md border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-foreground placeholder:text-[var(--muted)] focus:border-emerald-400/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={adding || !newText.trim()}
              className="rounded-md bg-emerald-400/90 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
            >
              추가
            </button>
          </div>

          <ul className="mt-3 flex flex-col gap-1">
            {todos === null ? (
              <li className="text-xs text-[var(--muted)]">불러오는 중...</li>
            ) : todayOpen.length === 0 ? (
              <li className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
                오늘 추가한 할 일이 없어요.
              </li>
            ) : (
              todayOpen.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={pendingId === t.id}
                    onChange={() => void toggle(t)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-400"
                    aria-label="완료 처리"
                  />
                  <span className="truncate">{t.text}</span>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
