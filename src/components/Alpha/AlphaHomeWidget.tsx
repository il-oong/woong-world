"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AlertsResponse, PortfolioAlert } from "@/app/api/alpha/alerts/route";
import type { RecommendationsCache } from "@/app/api/alpha/recommendations/route";

const ALERT_ICON: Record<string, string> = {
  danger: "🔴",
  warning: "🟡",
  success: "🟢",
};

const FEAR_COLOR = (score: number) =>
  score >= 75 ? "text-rose-400" :
  score >= 55 ? "text-orange-400" :
  score >= 45 ? "text-zinc-300" :
  score >= 25 ? "text-emerald-300" : "text-emerald-400";

const FEAR_BG = (score: number) =>
  score >= 75 ? "bg-rose-500/10 border-rose-500/20" :
  score >= 55 ? "bg-orange-500/10 border-orange-500/20" :
  score >= 45 ? "bg-zinc-800 border-zinc-700" :
  score >= 25 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-500/15 border-emerald-500/30";

export default function AlphaHomeWidget() {
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [recs, setRecs] = useState<RecommendationsCache | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/alpha/alerts").then((r) => r.ok ? r.json() as Promise<AlertsResponse> : null),
      fetch("/api/alpha/recommendations").then((r) => r.ok ? r.json() as Promise<RecommendationsCache> : null),
    ]).then(([a, r]) => {
      setAlerts(a);
      setRecs(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const topRec = recs?.items?.[0] ?? null;
  const shownAlerts = (alerts?.alerts ?? []).slice(0, 3);

  return (
    <Link
      href="/apps/alpha"
      className="group flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-amber-500/40"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-400">biseo / alpha</p>
        {alerts?.fearScore !== null && alerts?.fearScore !== undefined && !loading && (
          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${FEAR_COLOR(alerts.fearScore)} ${FEAR_BG(alerts.fearScore)}`}>
            {alerts.fearLabel ?? "공포지수"} {alerts.fearScore}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-600 animate-pulse py-4 text-center">불러오는 중…</p>
      ) : (
        <div className="flex-1 space-y-3">
          {/* Alerts */}
          {shownAlerts.length > 0 && (
            <div className="space-y-1.5">
              {shownAlerts.map((a: PortfolioAlert) => (
                <div key={`${a.holdingId}-${a.type}`} className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 mt-0.5">{ALERT_ICON[a.level]}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-zinc-200">{a.name}</span>
                    <span className="text-zinc-500 ml-1">{a.message}</span>
                  </div>
                </div>
              ))}
              {(alerts?.alerts.length ?? 0) > 3 && (
                <p className="text-[10px] text-zinc-600 pl-5">+{(alerts?.alerts.length ?? 0) - 3}개 알림 더 보기</p>
              )}
            </div>
          )}

          {shownAlerts.length === 0 && (
            <p className="text-[11px] text-zinc-600">포트폴리오 알림 없음</p>
          )}

          {/* Top Recommendation */}
          {topRec && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] text-amber-500/70 mb-0.5">JKP 추천</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white">{topRec.name}</span>
                <span className="font-mono text-[10px] text-zinc-500">{topRec.ticker}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-amber-300">{topRec.theme}</span>
                <span className="text-[10px] text-emerald-400 font-mono">{topRec.expected_move}</span>
              </div>
            </div>
          )}

          {!topRec && (
            <p className="text-[11px] text-zinc-600">추천 종목 없음 — ALPHA 앱에서 생성하세요</p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--muted)] group-hover:text-foreground">
        <span>알림 · 추천 · 분석 · 경제 캘린더</span>
        <span>→</span>
      </div>
    </Link>
  );
}
