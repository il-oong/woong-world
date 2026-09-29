"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Memo } from "@/lib/memos";

const PREVIEW_COUNT = 5;

const ERROR_LABEL: Record<string, string> = {
  not_connected: "로그인이 필요해요.",
  storage_not_configured: "저장소가 설정되지 않았어요.",
  limit_exceeded: "메모는 최대 200개까지 저장할 수 있어요.",
  text_too_long: "메모가 너무 길어요 (최대 5,000자).",
};

async function fetchMemos(): Promise<{ memos: Memo[]; err: string | null }> {
  try {
    const res = await fetch("/api/memos");
    const data = (await res.json().catch(() => ({}))) as {
      memos?: Memo[];
      error?: string;
    };
    if (!res.ok) return { memos: [], err: data.error ?? `http_${res.status}` };
    return { memos: data.memos ?? [], err: null };
  } catch {
    return { memos: [], err: "load_failed" };
  }
}

export default function HomeMemoWidget() {
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const next = await fetchMemos();
    setMemos(next.memos);
    setErr(next.err);
  }

  useEffect(() => {
    let cancelled = false;
    fetchMemos().then((next) => {
      if (cancelled) return;
      setMemos(next.memos);
      setErr(next.err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", text: t }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `http_${res.status}`);
        return;
      }
      setText("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  const preview = (memos ?? []).slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400">
          biseo / memo
        </p>
        <Link
          href="/apps/memo"
          className="text-[10px] text-zinc-500 transition hover:text-zinc-300"
        >
          전체 보기 →
        </Link>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="빠른 메모 추가…"
          maxLength={5000}
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-black/30 px-3 py-1.5 text-xs outline-none focus:border-amber-400/50"
        />
        <button
          type="submit"
          disabled={adding || !text.trim()}
          className="shrink-0 rounded-md border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-40"
        >
          {adding ? "…" : "추가"}
        </button>
      </form>

      {err && (
        <p className="text-[11px] text-rose-300">
          {ERROR_LABEL[err] ?? "메모를 불러오지 못했어요."}
        </p>
      )}

      {memos === null ? (
        <p className="animate-pulse py-4 text-center text-[11px] text-zinc-600">
          불러오는 중…
        </p>
      ) : preview.length === 0 ? (
        !err && (
          <p className="py-2 text-center text-[11px] text-zinc-600">
            아직 메모가 없어요.
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-1.5">
          {preview.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-[var(--border)] bg-black/20 px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                {m.pinned && <span className="text-[10px] text-amber-400">📌</span>}
                {m.title && (
                  <span className="truncate text-xs font-medium">{m.title}</span>
                )}
              </div>
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-[11px] text-[var(--muted)]">
                {m.text}
              </p>
            </li>
          ))}
          {memos.length > PREVIEW_COUNT && (
            <li className="text-right text-[10px] text-zinc-500">
              외 {memos.length - PREVIEW_COUNT}개
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
