"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { EconEvent, PositionAction } from "@/lib/alpha";

const IMPORTANCE_LABEL: Record<string, string> = { high: "높음", medium: "보통", low: "낮음" };
const IMPORTANCE_COLOR: Record<string, string> = {
  high: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  low: "text-zinc-400 bg-zinc-800 border-zinc-700",
};
const DOT_COLOR: Record<string, string> = {
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-zinc-400",
};
const ACTION_COLOR: Record<PositionAction, string> = {
  매수: "text-emerald-400 bg-emerald-500/10",
  추매: "text-emerald-300 bg-emerald-500/10",
  절반매도: "text-amber-400 bg-amber-500/10",
  매도: "text-rose-400 bg-rose-500/10",
  보유: "text-zinc-300 bg-zinc-800",
  관망: "text-zinc-400 bg-zinc-800",
};

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function daysLeft(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ev = new Date(dateStr);
  return Math.ceil((ev.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DayBadge({ d }: { d: number }) {
  if (d < 0) return <span className="text-[10px] text-zinc-600">D+{Math.abs(d)}</span>;
  if (d === 0) return <span className="text-[10px] font-bold text-amber-400">D-DAY</span>;
  if (d <= 3) return <span className="text-[10px] font-bold text-rose-400">D-{d}</span>;
  if (d <= 7) return <span className="text-[10px] text-amber-400">D-{d}</span>;
  return <span className="text-[10px] text-zinc-500">D-{d}</span>;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [form, setForm] = useState({
    title: "",
    eventDate: "",
    importance: "high" as EconEvent["importance"],
    market: "GLOBAL" as EconEvent["market"],
    memo: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/alpha/calendar");
    if (res.ok) setEvents(await res.json() as EconEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/alpha/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ title: "", eventDate: "", importance: "high", market: "GLOBAL", memo: "" });
      setShowForm(false);
      fetchEvents();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch("/api/alpha/calendar", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchEvents();
  };

  const handleAutoFill = async () => {
    setAutoLoading(true);
    setAutoResult(null);
    const res = await fetch("/api/alpha/calendar/auto", { method: "POST" });
    setAutoLoading(false);
    if (res.ok) {
      const data = await res.json() as { added: number };
      setAutoResult(`${data.added}개 일정 추가됨`);
      fetchEvents();
      setTimeout(() => setAutoResult(null), 3000);
    } else {
      setAutoResult("자동 수집 실패");
    }
  };

  const handleGetAdvice = async (id: string) => {
    setAdviceLoading(id);
    const res = await fetch("/api/alpha/calendar/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: id }),
    });
    setAdviceLoading(null);
    if (res.ok) {
      fetchEvents();
      setExpandedId(id);
    }
  };

  // Calendar grid computation
  const calendarGrid = useMemo(() => {
    // Map events by date string
    const byDate: Record<string, EconEvent[]> = {};
    for (const ev of events) {
      if (!byDate[ev.eventDate]) byDate[ev.eventDate] = [];
      byDate[ev.eventDate].push(ev);
    }

    const firstDay = new Date(viewYear, viewMonth, 1);
    // JS getDay(): 0=Sun,1=Mon,...6=Sat → convert to Mon-first: Mon=0,...Sun=6
    const rawFirst = firstDay.getDay();
    const startOffset = rawFirst === 0 ? 6 : rawFirst - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells: { day: number | null; dateStr: string | null }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push({ day: null, dateStr: null });
      } else {
        cells.push({ day: dayNum, dateStr: toDateStr(viewYear, viewMonth, dayNum) });
      }
    }

    return { cells, byDate };
  }, [events, viewYear, viewMonth]);

  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return calendarGrid.byDate[selectedDate] ?? [];
  }, [selectedDate, calendarGrid.byDate]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null);
  };

  const upcoming = events.filter((e) => daysLeft(e.eventDate) >= 0);
  const past = events.filter((e) => daysLeft(e.eventDate) < 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="rounded p-1 text-zinc-400 hover:text-zinc-200 transition">←</button>
          <span className="text-sm font-medium text-zinc-200 min-w-[7rem] text-center">
            {viewYear}년 {viewMonth + 1}월
          </span>
          <button type="button" onClick={nextMonth} className="rounded p-1 text-zinc-400 hover:text-zinc-200 transition">→</button>
          <span className="text-[10px] text-zinc-600">{upcoming.length}개 예정 · {past.length}개 지남</span>
        </div>
        <div className="flex items-center gap-2">
          {autoResult && (
            <span className="text-[10px] text-emerald-400">{autoResult}</span>
          )}
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={autoLoading}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-amber-500/50 hover:text-amber-300 transition disabled:opacity-50"
          >
            {autoLoading ? "수집 중…" : "AI 자동 채우기"}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-amber-500/50 hover:text-amber-300 transition"
          >
            {showForm ? "취소" : "+ 직접 추가"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">일정명 *</span>
              <input required placeholder="FOMC 금리결정" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">날짜 *</span>
              <input required type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">중요도</span>
              <select value={form.importance} onChange={(e) => setForm((f) => ({ ...f, importance: e.target.value as EconEvent["importance"] }))} className={inputCls}>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">시장</span>
              <select value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value as EconEvent["market"] }))} className={inputCls}>
                <option value="GLOBAL">GLOBAL</option>
                <option value="US">US</option>
                <option value="KR">KR</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">메모</span>
              <input placeholder="메모" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} className={inputCls} />
            </label>
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-amber-500/20 border border-amber-500/40 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50">
            {saving ? "저장 중…" : "추가"}
          </button>
        </form>
      )}

      {/* Calendar grid */}
      {loading ? (
        <p className="text-xs text-zinc-600 py-8 text-center">불러오는 중…</p>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`py-1.5 text-center text-[10px] font-medium ${
                  i === 5 ? "text-blue-400/70" : i === 6 ? "text-rose-400/70" : "text-zinc-500"
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarGrid.cells.map((cell, idx) => {
              if (!cell.day || !cell.dateStr) {
                return <div key={idx} className="min-h-[56px] border-b border-r border-zinc-800/50 last:border-r-0" />;
              }
              const cellEvents = calendarGrid.byDate[cell.dateStr] ?? [];
              const isToday = cell.dateStr === todayStr;
              const isPast = cell.dateStr < todayStr;
              const isSelected = cell.dateStr === selectedDate;
              const hasEvents = cellEvents.length > 0;
              const highestImportance = cellEvents.find(e => e.importance === "high")
                ? "high"
                : cellEvents.find(e => e.importance === "medium")
                  ? "medium"
                  : cellEvents.length > 0 ? "low" : null;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (hasEvents) setSelectedDate(isSelected ? null : cell.dateStr);
                  }}
                  className={`min-h-[56px] border-b border-r border-zinc-800/50 last:border-r-0 p-1 flex flex-col gap-0.5 transition ${
                    hasEvents ? "cursor-pointer hover:bg-zinc-800/40" : ""
                  } ${isSelected ? "bg-zinc-800/60 ring-inset ring-1 ring-amber-500/30" : ""} ${
                    isPast ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-medium rounded-full w-5 h-5 flex items-center justify-center ${
                        isToday
                          ? "ring-1 ring-blue-500 text-blue-300"
                          : isPast
                            ? "text-zinc-700"
                            : "text-zinc-400"
                      }`}
                    >
                      {cell.day}
                    </span>
                    {hasEvents && (
                      <span className="text-[9px] text-zinc-600">{cellEvents.length}</span>
                    )}
                  </div>
                  {/* Event dots */}
                  {hasEvents && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {cellEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className={`block rounded-full w-1.5 h-1.5 ${DOT_COLOR[ev.importance]}`}
                          title={ev.title}
                        />
                      ))}
                    </div>
                  )}
                  {/* D-day badge for important upcoming events */}
                  {hasEvents && !isPast && highestImportance === "high" && (
                    <span className="text-[9px] text-rose-400/80 leading-none">
                      {(() => {
                        const d = daysLeft(cell.dateStr);
                        if (d === 0) return "D-DAY";
                        if (d > 0 && d <= 7) return `D-${d}`;
                        return null;
                      })()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {(["high", "medium", "low"] as const).map(imp => (
          <div key={imp} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${DOT_COLOR[imp]}`} />
            <span className="text-[10px] text-zinc-600">{IMPORTANCE_LABEL[imp]}</span>
          </div>
        ))}
      </div>

      {/* Selected date events */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{selectedDate} 일정</p>
          {selectedEvents.map((ev) => {
            const d = daysLeft(ev.eventDate);
            const isPast = d < 0;
            const isExpanded = expandedId === ev.id;

            return (
              <div key={ev.id} className={`rounded-xl border ${isPast ? "border-zinc-800/50 opacity-50" : "border-zinc-800"} bg-zinc-900/40`}>
                <div className="flex items-start justify-between gap-2 p-4">
                  <div className="flex items-start gap-3 flex-wrap min-w-0">
                    <DayBadge d={d} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-white">{ev.title}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${IMPORTANCE_COLOR[ev.importance]}`}>
                          {IMPORTANCE_LABEL[ev.importance]}
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{ev.market}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{ev.eventDate}</p>
                      {ev.memo && <p className="text-[11px] text-zinc-600 mt-0.5">{ev.memo}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isPast && (
                      <button
                        type="button"
                        onClick={() => {
                          if (ev.positionAdvice) {
                            setExpandedId(isExpanded ? null : ev.id);
                          } else {
                            handleGetAdvice(ev.id);
                          }
                        }}
                        disabled={adviceLoading === ev.id}
                        className="rounded px-2 py-1 text-[10px] border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
                      >
                        {adviceLoading === ev.id
                          ? "분석 중…"
                          : ev.positionAdvice
                            ? isExpanded
                              ? "접기"
                              : "조언 보기"
                            : "JKP 조언"}
                      </button>
                    )}
                    <button type="button" onClick={() => handleDelete(ev.id)} className="rounded p-1 text-zinc-600 hover:text-rose-400 transition" aria-label="삭제">
                      ✕
                    </button>
                  </div>
                </div>

                {isExpanded && ev.positionAdvice && (
                  <div className="border-t border-zinc-800 p-4 space-y-3">
                    <p className="text-sm text-amber-200 font-medium">{ev.positionAdvice.summary}</p>
                    <div className="space-y-2">
                      {ev.positionAdvice.actions.map((a, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${ACTION_COLOR[a.action as PositionAction] ?? "text-zinc-300 bg-zinc-800"}`}>
                            {a.action}
                          </span>
                          <div className="text-xs text-zinc-400 min-w-0">
                            <span>{a.reason}</span>
                            <span className="ml-2 text-zinc-600">{a.timing}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                      <p className="text-[10px] text-rose-500/70 uppercase tracking-wider mb-0.5">핵심 리스크</p>
                      <p className="text-xs text-rose-300">{ev.positionAdvice.riskNote}</p>
                    </div>
                    <p className="text-[10px] text-zinc-700">
                      생성: {new Date(ev.positionAdvice.generatedAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-xs text-zinc-600">
          FOMC, CPI, 실적발표 등 중요 일정을 추가하세요
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none";
