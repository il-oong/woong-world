"use client";

import type { computeStats } from "@/lib/life-dashboard";

type Stats = ReturnType<typeof computeStats>;

type Props = { stats: Stats | null };

export default function HabitStats({ stats }: Props) {
  if (!stats) {
    return (
      <div className="py-16 text-center text-zinc-500 text-sm">
        습관 탭에서 습관을 추가하면 통계가 표시됩니다
      </div>
    );
  }

  const { overallRate, habitStats, topMissed, streaks } = stats;
  const streakMap = new Map(streaks.map(s => [s.habitId, s.streak]));

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">전체 시스템 달성률</p>
          <p className={`text-3xl font-bold ${overallRate >= 0.7 ? "text-emerald-400" : overallRate >= 0.4 ? "text-yellow-400" : "text-red-400"}`}>
            {Math.round(overallRate * 100)}%
          </p>
          <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overallRate >= 0.7 ? "bg-emerald-400" : overallRate >= 0.4 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${Math.round(overallRate * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">가장 많이 실패한 습관</p>
          {topMissed ? (
            <>
              <p className="text-base font-semibold text-white mt-1">{topMissed.name}</p>
              <p className="text-xs text-zinc-500 mt-1">달성률 {Math.round(topMissed.rate * 100)}%</p>
            </>
          ) : (
            <p className="text-zinc-600 text-sm mt-1">없음</p>
          )}
        </div>
      </div>

      {/* Per habit */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-sm font-medium text-zinc-300">습관별 현황</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {habitStats.map(h => {
            const streak = streakMap.get(h.habitId) ?? 0;
            const pct = Math.round(h.rate * 100);
            return (
              <div key={h.habitId} className="px-4 py-3 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
                <span className="flex-1 text-sm text-zinc-200 truncate">{h.name}</span>
                <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: h.color }}
                  />
                </div>
                <span className={`text-xs font-semibold w-9 text-right ${pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                  {pct}%
                </span>
                {streak > 0 && (
                  <span className="text-xs text-orange-400 flex items-center gap-0.5">
                    🔥{streak}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
