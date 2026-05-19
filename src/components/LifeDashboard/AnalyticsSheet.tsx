"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import type { AnalyticsData } from "@/app/api/life-dashboard/analytics/route";

const CHART_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#38bdf8"];

function fmtKRW(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return `${n.toLocaleString()}`;
}

// GitHub-style contribution heatmap
function HabitHeatmap({ data }: { data: AnalyticsData["habitHeatmap"] }) {
  if (!data.length) return null;

  // Group by week (Sunday-start)
  const weeks: typeof data[] = [];
  let week: typeof data = [];
  data.forEach((d, i) => {
    week.push(d);
    if (week.length === 7 || i === data.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  const cellColor = (rate: number) => {
    if (rate === 0) return "bg-zinc-800";
    if (rate < 0.25) return "bg-blue-900/60";
    if (rate < 0.5) return "bg-blue-700/70";
    if (rate < 0.75) return "bg-blue-500/80";
    return "bg-blue-400";
  };

  const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-3">습관 히트맵 (52주)</p>
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {wk.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${Math.round(d.rate * 100)}% (${d.count}개)`}
                  className={`w-3 h-3 rounded-sm ${cellColor(d.rate)} cursor-default`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[9px] text-zinc-600">
        <span>적음</span>
        <div className="flex gap-0.5">
          {["bg-zinc-800", "bg-blue-900/60", "bg-blue-700/70", "bg-blue-500/80", "bg-blue-400"].map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
          ))}
        </div>
        <span>많음</span>
      </div>
    </div>
  );
}

export default function AnalyticsSheet() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/life-dashboard/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d as AnalyticsData); setLoading(false); })
      .catch(() => { setError("데이터 로드 실패"); setLoading(false); });
  }, []);

  if (loading) return <p className="text-xs text-zinc-600 py-12 text-center animate-pulse">분석 데이터 수집 중…</p>;
  if (error || !data) return <p className="text-xs text-rose-500 py-8 text-center">{error ?? "오류"}</p>;

  const { habitMonthly, habitHeatmap, routineDaily, todoMonthly, finance } = data;

  // Finance pie data
  const pieParts = finance
    ? [
        { name: "고정지출", value: finance.fixed },
        { name: "구독료", value: finance.subscriptionMonthly },
        { name: "변동지출", value: finance.variable },
      ].filter((p) => p.value > 0)
    : [];

  const lastNRoutine = routineDaily.slice(-30);

  return (
    <div className="space-y-10">
      {/* Habit Heatmap */}
      <Section title="습관 히트맵">
        <HabitHeatmap data={habitHeatmap} />
      </Section>

      {/* Habit Monthly Rate */}
      <Section title="월별 습관 달성률 (12개월)">
        {habitMonthly.every((d) => d.total === 0) ? (
          <Empty msg="습관 데이터가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={habitMonthly} margin={{ left: -20 }}>
              <XAxis
                dataKey="ym"
                tickFormatter={(v: string) => v.slice(5)}
                tick={{ fontSize: 10, fill: "#71717a" }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: "#71717a" }}
              />
              <Tooltip
                formatter={(v: unknown) => [`${v}%`, "달성률"]}
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
              />
              <Bar dataKey="rate" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Routine Daily */}
      {lastNRoutine.length > 0 && (
        <Section title="루틴 달성률 (최근 30일)">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={lastNRoutine} margin={{ left: -20 }}>
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => `${parseInt(v.slice(8))}일`}
                tick={{ fontSize: 10, fill: "#71717a" }}
                interval={6}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: "#71717a" }}
              />
              <Tooltip
                formatter={(v: unknown) => [`${v}%`, "달성률"]}
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Todo Monthly */}
      <Section title="월별 할 일 완료 (12개월)">
        {todoMonthly.every((d) => d.created === 0) ? (
          <Empty msg="할 일 데이터가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={todoMonthly} margin={{ left: -20 }}>
              <XAxis
                dataKey="ym"
                tickFormatter={(v: string) => v.slice(5)}
                tick={{ fontSize: 10, fill: "#71717a" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
              />
              <Bar dataKey="created" name="생성" fill="#71717a" radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="done" name="완료" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Finance Summary */}
      {finance && (
        <Section title="이번달 재정 개요">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Pie */}
            {pieParts.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 mb-2">지출 구성</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieParts}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={false}
                    >
                      {pieParts.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => [`${fmtKRW(Number(v))}원`, ""]}
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary numbers */}
            <div className="space-y-3">
              <FinRow label="수입" value={finance.income} color="emerald" />
              <FinRow label="고정지출" value={finance.fixed} color="amber" />
              <FinRow label="구독료" value={finance.subscriptionMonthly} color="orange" />
              <FinRow label="변동지출" value={finance.variable} color="zinc" />
              <div className="pt-2 border-t border-zinc-800">
                <FinRow
                  label={finance.net >= 0 ? "잉여" : "초과"}
                  value={Math.abs(finance.net)}
                  color={finance.net >= 0 ? "blue" : "rose"}
                  bold
                />
              </div>
              {finance.income > 0 && (
                <p className="text-[10px] text-zinc-600">
                  저축률 {Math.max(0, (finance.net / finance.income) * 100).toFixed(0)}%
                </p>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-4">{title}</p>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 py-8 text-center text-xs text-zinc-600">
      {msg}
    </div>
  );
}

function FinRow({
  label, value, color, bold,
}: {
  label: string; value: number; color: string; bold?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    orange: "text-orange-400",
    zinc: "text-zinc-400",
    blue: "text-blue-400",
    rose: "text-rose-400",
  };
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-semibold text-zinc-200" : "text-zinc-500"}`}>{label}</span>
      <span className={`text-xs font-mono ${colorMap[color] ?? "text-zinc-300"} ${bold ? "font-bold" : ""}`}>
        {value > 0 ? `₩${value.toLocaleString()}` : "—"}
      </span>
    </div>
  );
}
