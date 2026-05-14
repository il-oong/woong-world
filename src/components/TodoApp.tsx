"use client";

import { useEffect, useState } from "react";
import { scopeOf, type Todo, type TodoScope, type TodoStats } from "@/lib/todos";

const SCOPE_LABEL: Record<TodoScope, string> = {
  day: "일간",
  week: "주간",
  month: "월간",
};
const SCOPES: TodoScope[] = ["day", "week", "month"];

type Response = { todos: Todo[]; stats: TodoStats };

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

function fullTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayTabLabel(key: string, now: Date = new Date()): string {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const todayKey = dayKey(now.getTime());
  if (key === todayKey) return "오늘";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return "어제";
  if (target.getFullYear() === now.getFullYear()) return `${m}/${d}`;
  return `${String(y).slice(2)}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [newScope, setNewScope] = useState<TodoScope>("day");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    try {
      const res = await fetch("/api/todos");
      if (res.status === 401) {
        setErr("not_connected");
        setTodos([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<Response> & {
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
    if (!t) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, scope: newScope }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      setNewText("");
      await load();
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (todo: Todo) => {
    setPendingId(todo.id);
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !todo.done }),
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

  const saveEdit = async (todo: Todo) => {
    const t = editText.trim();
    if (!t || t === todo.text) {
      setEditingId(null);
      return;
    }
    setPendingId(todo.id);
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
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

  const changeScope = async (todo: Todo, scope: TodoScope) => {
    if (scopeOf(todo) === scope) return;
    setPendingId(todo.id);
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
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

  const remove = async (todo: Todo) => {
    if (!confirm(`"${todo.text}" 삭제할까요?`)) return;
    setPendingId(todo.id);
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
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

  if (todos === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="animate-pulse text-xs text-[var(--muted)]">
          불러오는 중...
        </span>
      </div>
    );
  }

  const openCount = todos.filter((t) => !t.done).length;
  const byScope: Record<TodoScope, Todo[]> = { day: [], week: [], month: [] };
  for (const t of todos) byScope[scopeOf(t)].push(t);

  // 일간 todo만 작성일 탭으로 필터.
  const dailyTodos = byScope.day;
  const dayCounts = new Map<string, number>();
  for (const t of dailyTodos) {
    const k = dayKey(t.createdAt);
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }
  const dayKeys = Array.from(dayCounts.keys()).sort((a, b) => (a < b ? 1 : -1));
  const filteredDaily =
    selectedDay === "all"
      ? dailyTodos
      : dailyTodos.filter((t) => dayKey(t.createdAt) === selectedDay);

  const renderItem = (todo: Todo) => {
    const isEditing = editingId === todo.id;
    const s = scopeOf(todo);
    return (
      <li
        key={todo.id}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
      >
        <input
          type="checkbox"
          checked={todo.done}
          disabled={pendingId === todo.id}
          onChange={() => void toggle(todo)}
          className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          aria-label={todo.done ? "완료 해제" : "완료 처리"}
        />

        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveEdit(todo);
              } else if (e.key === "Escape") {
                setEditingId(null);
              }
            }}
            onBlur={() => void saveEdit(todo)}
            maxLength={280}
            className="flex-1 rounded border border-[var(--accent)]/60 bg-black/30 px-2 py-1 text-sm text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingId(todo.id);
              setEditText(todo.text);
            }}
            className="flex-1 min-w-0 text-left"
            title="클릭해서 편집"
          >
            <span
              className={`block truncate text-sm ${todo.done ? "text-[var(--muted)] line-through" : "text-foreground"}`}
            >
              {todo.text}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] text-[var(--muted)]">
              <time dateTime={new Date(todo.createdAt).toISOString()} title={fullTs(todo.createdAt)}>
                {formatTs(todo.createdAt, now)}
              </time>
              {todo.done && todo.doneAt && (
                <>
                  <span className="mx-1 opacity-50">·</span>
                  <time dateTime={new Date(todo.doneAt).toISOString()} title={fullTs(todo.doneAt)}>
                    완료 {formatTs(todo.doneAt, now)}
                  </time>
                </>
              )}
            </span>
          </button>
        )}

        <ScopeMenu
          current={s}
          disabled={pendingId === todo.id}
          onChange={(next) => void changeScope(todo, next)}
        />

        <button
          type="button"
          onClick={() => void remove(todo)}
          disabled={pendingId === todo.id}
          aria-label="삭제"
          className="shrink-0 rounded p-1 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
        >
          ✕
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          biseo / todo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">할 일</h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {todos.length === 0
            ? "할 일이 비어있어요."
            : `미완료 ${openCount}개 / 전체 ${todos.length}개`}
        </p>
      </header>

      {err === "storage_not_configured" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Redis(UPSTASH)가 연결되어 있지 않아 저장이 동작하지 않습니다.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] p-0.5 text-xs">
          {SCOPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setNewScope(s)}
              aria-pressed={newScope === s}
              className={`rounded-md px-2.5 py-1 transition ${
                newScope === s
                  ? "bg-[var(--accent)] text-black"
                  : "text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2">
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
            placeholder={`새 ${SCOPE_LABEL[newScope]} 할 일 (Enter)`}
            maxLength={280}
            className="flex-1 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !newText.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {adding ? "..." : "추가"}
          </button>
        </div>
      </div>

      {todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-xs text-[var(--muted)]">
          첫 할 일을 추가해보세요.
        </div>
      ) : (
        <>
          {(["month", "week"] as const).map((s) => {
            const items = byScope[s];
            const open = items.filter((t) => !t.done).length;
            return (
              <section key={s}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  <span>{SCOPE_LABEL[s]} 계획</span>
                  <span className="font-mono text-[10px] opacity-70">
                    {open}/{items.length}
                  </span>
                </h2>
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
                    {SCOPE_LABEL[s]} 계획이 비어있어요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">{items.map(renderItem)}</ul>
                )}
              </section>
            );
          })}

          <section>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <span>일간</span>
              <span className="font-mono text-[10px] opacity-70">
                {dailyTodos.filter((t) => !t.done).length}/{dailyTodos.length}
              </span>
            </h2>
            {dayKeys.length > 0 && (
              <nav
                className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1"
                aria-label="작성일 필터"
              >
                <DayTab
                  label="전체"
                  count={dailyTodos.length}
                  active={selectedDay === "all"}
                  onClick={() => setSelectedDay("all")}
                />
                {dayKeys.map((k) => (
                  <DayTab
                    key={k}
                    label={dayTabLabel(k, now)}
                    count={dayCounts.get(k) ?? 0}
                    active={selectedDay === k}
                    onClick={() => setSelectedDay(k)}
                  />
                ))}
              </nav>
            )}
            {dailyTodos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
                일간 할 일이 비어있어요.
              </p>
            ) : filteredDaily.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
                이 날짜에는 할 일이 없어요.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">{filteredDaily.map(renderItem)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ScopeMenu({
  current,
  disabled,
  onChange,
}: {
  current: TodoScope;
  disabled: boolean;
  onChange: (next: TodoScope) => void;
}) {
  return (
    <select
      value={current}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TodoScope)}
      onClick={(e) => e.stopPropagation()}
      aria-label="범위 변경"
      className="shrink-0 cursor-pointer rounded border border-[var(--border)] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground focus:outline-none disabled:opacity-40"
    >
      {SCOPES.map((s) => (
        <option key={s} value={s}>
          {SCOPE_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function DayTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)]"
          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/30 hover:text-foreground"
      }`}
    >
      {label}
      <span className={`ml-1.5 font-mono text-[10px] ${active ? "opacity-80" : "opacity-60"}`}>
        {count}
      </span>
    </button>
  );
}
