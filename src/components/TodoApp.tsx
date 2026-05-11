"use client";

import { useEffect, useState } from "react";
import type { Todo, TodoStats } from "@/lib/todos";

type Response = { todos: Todo[]; stats: TodoStats };

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

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
        body: JSON.stringify({ text: t }),
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
          placeholder="새 할 일 (Enter로 추가)"
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

      {todos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-xs text-[var(--muted)]">
          첫 할 일을 추가해보세요.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {todos.map((todo) => {
            const isEditing = editingId === todo.id;
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
                    className={`flex-1 truncate text-left text-sm ${todo.done ? "text-[var(--muted)] line-through" : "text-foreground"}`}
                    title="클릭해서 편집"
                  >
                    {todo.text}
                  </button>
                )}

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
          })}
        </ul>
      )}
    </div>
  );
}
