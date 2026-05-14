"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { scopeOf, type Todo, type TodoScope } from "@/lib/todos";

const SCOPE_LABEL: Record<TodoScope, string> = {
  day: "일간",
  week: "주간",
  month: "월간",
};
const SCOPES: TodoScope[] = ["day", "week", "month"];

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
  const [newScope, setNewScope] = useState<TodoScope>("day");

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
        body: JSON.stringify({ text: t, scope: newScope }),
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

  const all = todos ?? [];
  const todayOpen = all.filter(
    (t) => !t.done && scopeOf(t) === "day" && isToday(t.createdAt),
  );
  const weeklyOpen = all.filter((t) => !t.done && scopeOf(t) === "week");
  const monthlyOpen = all.filter((t) => !t.done && scopeOf(t) === "month");

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
          <div className="flex gap-1.5">
            <div className="flex gap-0.5 rounded-md border border-[var(--border)] p-0.5 text-[10px]">
              {SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewScope(s)}
                  aria-pressed={newScope === s}
                  className={`rounded px-1.5 py-0.5 transition ${
                    newScope === s
                      ? "bg-emerald-400/90 text-black"
                      : "text-[var(--muted)] hover:text-foreground"
                  }`}
                >
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
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
              placeholder={`새 ${SCOPE_LABEL[newScope]} (Enter)`}
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

          {todos !== null && (monthlyOpen.length > 0 || weeklyOpen.length > 0) && (
            <div className="mt-3 flex flex-col gap-2">
              {monthlyOpen.length > 0 && (
                <ScopeSection
                  label="월간 계획"
                  todos={monthlyOpen}
                  accent="text-violet-300"
                  pendingId={pendingId}
                  onToggle={toggle}
                />
              )}
              {weeklyOpen.length > 0 && (
                <ScopeSection
                  label="주간 계획"
                  todos={weeklyOpen}
                  accent="text-sky-300"
                  pendingId={pendingId}
                  onToggle={toggle}
                />
              )}
            </div>
          )}

          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
            오늘
          </p>
          <ul className="mt-1 flex flex-col gap-1">
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

function ScopeSection({
  label,
  todos,
  accent,
  pendingId,
  onToggle,
}: {
  label: string;
  todos: Todo[];
  accent: string;
  pendingId: string | null;
  onToggle: (t: Todo) => void;
}) {
  return (
    <div>
      <p
        className={`mb-1 font-mono text-[10px] uppercase tracking-wider ${accent}`}
      >
        {label} · {todos.length}
      </p>
      <ul className="flex flex-col gap-1">
        {todos.slice(0, 4).map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-1.5 text-xs"
          >
            <input
              type="checkbox"
              checked={false}
              disabled={pendingId === t.id}
              onChange={() => onToggle(t)}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-emerald-400"
              aria-label="완료 처리"
            />
            <span className="truncate">{t.text}</span>
          </li>
        ))}
        {todos.length > 4 && (
          <li className="text-[10px] text-[var(--muted)]">
            ... 외 {todos.length - 4}개
          </li>
        )}
      </ul>
    </div>
  );
}
