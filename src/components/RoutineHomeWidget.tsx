"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isRoutineActiveOn, type Routine } from "@/lib/routines";

type Data = {
  routines: Routine[];
  todayChecked: string[];
  today: string;
};

function todayWeekdayFromIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function RoutineHomeWidget() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/routines");
      if (res.status === 401) {
        setErr("not_connected");
        setData({ routines: [], todayChecked: [], today: "" });
        return;
      }
      const d = (await res.json().catch(() => ({}))) as Data | { error: string };
      if (!res.ok || "error" in d) {
        setErr(("error" in d && d.error) || `http_${res.status}`);
        return;
      }
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load_failed");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (routineId: string) => {
    if (!data) return;
    const has = data.todayChecked.includes(routineId);
    const optimistic = has
      ? data.todayChecked.filter((x) => x !== routineId)
      : [...data.todayChecked, routineId];
    setData({ ...data, todayChecked: optimistic });
    try {
      await fetch(`/api/routines/${encodeURIComponent(routineId)}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      await load();
    }
  };

  const todayWeekday = data?.today ? todayWeekdayFromIso(data.today) : new Date().getDay();
  const activeRoutines = (data?.routines ?? []).filter((r) =>
    isRoutineActiveOn(r, todayWeekday),
  );
  const activeIds = new Set(activeRoutines.map((r) => r.id));
  const checked = (data?.todayChecked ?? []).filter((id) => activeIds.has(id)).length;
  const total = activeRoutines.length;

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-300">
            biseo / routine
          </p>
          <h2 className="mt-1 text-base font-medium">오늘의 루틴</h2>
          {total > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {checked} / {total}
            </p>
          )}
        </div>
        <Link
          href="/apps/routine"
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:border-sky-400/40 hover:text-foreground"
        >
          전체 →
        </Link>
      </div>

      {err === "not_connected" || err === "storage_not_configured" ? (
        <p className="text-xs text-[var(--muted)]">사용하려면 로그인이 필요해요.</p>
      ) : data === null ? (
        <p className="text-xs text-[var(--muted)]">불러오는 중...</p>
      ) : data.routines.length === 0 ? (
        <Link
          href="/apps/routine"
          className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)] hover:border-sky-400/40 hover:text-foreground"
        >
          첫 루틴을 추가해보세요 →
        </Link>
      ) : activeRoutines.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--muted)]">
          오늘은 예정된 루틴이 없어요
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {activeRoutines.map((r) => {
            const isChecked = data.todayChecked.includes(r.id);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => void toggle(r.id)}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-400"
                  aria-label={isChecked ? "체크 해제" : "체크"}
                />
                <span
                  className={`truncate ${isChecked ? "text-[var(--muted)] line-through" : ""}`}
                >
                  {r.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
