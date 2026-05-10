"use client";

import { useEffect, useState } from "react";
import type { Subscription, SubscriptionCycle } from "@/lib/subscriptions";

type Data = {
  subscriptions: Subscription[];
  monthlyTotal: number;
};

export function SubscriptionApp() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/subscriptions");
      const d = (await res.json().catch(() => ({}))) as
        | Data
        | { error: string };
      if (!res.ok || "error" in d) {
        setError(("error" in d && d.error) || `http_${res.status}`);
        return;
      }
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const remove = async (sub: Subscription) => {
    if (
      !confirm(
        `"${sub.name}" 구독을 제거할까요?${sub.calendarEventId ? " 캘린더 일정도 같이 삭제됩니다." : ""}`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/subscriptions/${encodeURIComponent(sub.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? `delete_failed_${res.status}`);
      return;
    }
    await refresh();
  };

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-xs text-[var(--muted)]">
        {error ?? "불러오는 중..."}
      </div>
    );
  }

  return (
    <>
      <header className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
          plugin / subscription
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          구독 관리
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          결제일을 캘린더에 자동 등록하고 월 합산을 봅니다.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          월 환산 합계
        </p>
        <p className="mt-1 text-2xl font-semibold">
          ₩{data.monthlyTotal.toLocaleString("ko-KR")}
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          연간 구독은 12로 나눠 합산. 등록 {data.subscriptions.length}건.
        </p>
      </section>

      {error && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      )}

      <ul className="mb-6 flex flex-col gap-2">
        {data.subscriptions.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-base">
              💳
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.calendarEventId && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                    📅 동기화됨
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-[var(--muted)]">
                {s.cycle === "monthly"
                  ? `매월 ${s.paymentDay}일`
                  : `매년 ${s.monthOfYear ?? 1}월 ${s.paymentDay}일`}
                {" · "}
                ₩{s.amount.toLocaleString("ko-KR")}
                {s.cycle === "yearly" ? " / 년" : " / 월"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void remove(s)}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-rose-300/70 hover:border-rose-500/40 hover:text-rose-300"
            >
              제거
            </button>
          </li>
        ))}
        {data.subscriptions.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
            등록된 구독이 없습니다.
          </li>
        )}
      </ul>

      <AddSubscriptionForm
        busy={adding}
        setBusy={setAdding}
        setError={setError}
        onAdded={refresh}
      />
    </>
  );
}

function AddSubscriptionForm({
  busy,
  setBusy,
  setError,
  onAdded,
}: {
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<SubscriptionCycle>("monthly");
  const [paymentDay, setPaymentDay] = useState("1");
  const [monthOfYear, setMonthOfYear] = useState("1");
  const [syncCalendar, setSyncCalendar] = useState(true);

  const submit = async () => {
    setError(null);
    const amt = parseInt(amount.replace(/[^\d]/g, ""), 10);
    const day = parseInt(paymentDay, 10);
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      setError("금액을 다시 확인해주세요.");
      return;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setError("결제일은 1~31 사이여야 합니다.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amount: amt,
          paymentDay: day,
          monthOfYear: cycle === "yearly" ? parseInt(monthOfYear, 10) : undefined,
          cycle,
          syncCalendar,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        calendarSyncError?: string;
      };
      if (!res.ok) {
        setError(d.error ?? `add_failed_${res.status}`);
        return;
      }
      if (d.calendarSyncError) {
        setError(`구독은 추가됐지만 캘린더 등록 실패: ${d.calendarSyncError}`);
      }
      setName("");
      setAmount("");
      setPaymentDay("1");
      setMonthOfYear("1");
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-xs uppercase tracking-wider text-[var(--muted)]">
        + 새 구독
      </h2>
      <div className="grid gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (예: Netflix)"
          className={inputCls}
          maxLength={60}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액 (₩)"
            className={inputCls}
            inputMode="numeric"
          />
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as SubscriptionCycle)}
            className={`${inputCls} bg-[#0b0b0f]`}
          >
            <option value="monthly">매월</option>
            <option value="yearly">매년</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cycle === "yearly" && (
            <select
              value={monthOfYear}
              onChange={(e) => setMonthOfYear(e.target.value)}
              className={`${inputCls} bg-[#0b0b0f]`}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          )}
          <select
            value={paymentDay}
            onChange={(e) => setPaymentDay(e.target.value)}
            className={`${inputCls} bg-[#0b0b0f] ${cycle === "monthly" ? "col-span-2" : ""}`}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={syncCalendar}
            onChange={(e) => setSyncCalendar(e.target.checked)}
          />
          Google 캘린더에 반복 일정으로 등록
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !amount.trim()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-black disabled:opacity-40"
        >
          {busy ? "추가 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded border border-[var(--border)] bg-black/30 px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none";
