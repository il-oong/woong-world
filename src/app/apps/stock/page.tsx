"use client";

import { useState, useRef } from "react";
import type { StockAnalysis, StockSignal } from "@/app/api/stock/analyze/route";

const SIGNAL_CONFIG: Record<StockSignal, { label: string; color: string; bg: string; border: string }> = {
  BUY: {
    label: "매수",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
  },
  SELL: {
    label: "매도",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
  },
  HOLD: {
    label: "홀드",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
  },
};

const SCORE_LABELS: Record<string, string> = {
  technical: "기술적 (RSI/이평)",
  momentum: "모멘텀",
  volume: "거래량",
  trend: "추세",
};

const POPULAR_KR = [
  { ticker: "005930", label: "삼성전자" },
  { ticker: "000660", label: "SK하이닉스" },
  { ticker: "035720", label: "카카오" },
  { ticker: "035420", label: "NAVER" },
];

const POPULAR_US = [
  { ticker: "AAPL", label: "Apple" },
  { ticker: "NVDA", label: "NVIDIA" },
  { ticker: "TSLA", label: "Tesla" },
  { ticker: "MSFT", label: "Microsoft" },
];

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 65 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ color, fontFamily: "var(--font-geist-mono)" }}>{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function StockPage() {
  const [ticker, setTicker] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StockAnalysis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function analyze(t: string, m: string) {
    const cleanTicker = t.trim().toUpperCase();
    if (!cleanTicker) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/stock/analyze?ticker=${encodeURIComponent(cleanTicker)}&market=${m}`);
      const json = await res.json() as StockAnalysis & { error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "분석 실패");
      } else {
        setData(json);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    analyze(ticker, market);
  }

  function handleQuick(t: string, m: "KR" | "US") {
    setTicker(t);
    setMarket(m);
    analyze(t, m);
  }

  const cfg = data ? SIGNAL_CONFIG[data.signal] : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--accent)" }}>
          biseo / stock
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          주식 신호 분석
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          JKP 퀀트 엔진 — RSI · 이동평균 · 모멘텀 · Gemini AI 종합 판단
        </p>
      </header>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMarket("KR")}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition"
            style={{
              borderColor: market === "KR" ? "var(--accent)" : "var(--border)",
              color: market === "KR" ? "var(--accent)" : "var(--muted)",
              background: market === "KR" ? "rgba(99,102,241,0.08)" : "transparent",
            }}
          >
            한국 주식
          </button>
          <button
            type="button"
            onClick={() => setMarket("US")}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition"
            style={{
              borderColor: market === "US" ? "var(--accent)" : "var(--border)",
              color: market === "US" ? "var(--accent)" : "var(--muted)",
              background: market === "US" ? "rgba(99,102,241,0.08)" : "transparent",
            }}
          >
            미국 주식
          </button>
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={market === "KR" ? "종목코드 입력 (예: 005930)" : "티커 입력 (예: AAPL)"}
            className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition"
            style={{
              borderColor: "var(--border)",
              background: "var(--card)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="rounded-xl px-6 py-3 text-sm font-medium transition disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "분석 중…" : "분석"}
          </button>
        </div>
      </form>

      {/* Quick picks */}
      <div className="mb-8 flex flex-wrap gap-2">
        <span className="self-center text-xs" style={{ color: "var(--muted)" }}>빠른 선택:</span>
        {(market === "KR" ? POPULAR_KR : POPULAR_US).map((s) => (
          <button
            key={s.ticker}
            type="button"
            onClick={() => handleQuick(s.ticker, market)}
            className="rounded-lg border px-3 py-1 text-xs transition hover:border-[var(--accent)]/50"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-6 rounded-xl border p-4 text-sm"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#ef4444" }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border p-6"
              style={{ borderColor: "var(--border)", background: "var(--card)", height: 80 + i * 20 }}
            />
          ))}
        </div>
      )}

      {/* Result */}
      {data && cfg && (
        <div className="flex flex-col gap-4">
          {/* Signal card */}
          <div
            className="rounded-2xl border p-6"
            style={{ borderColor: cfg.border, background: cfg.bg }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  {data.ticker} · {data.market}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{data.name}</h2>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold">
                    {data.market === "KR"
                      ? data.price.toLocaleString("ko-KR")
                      : data.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className="font-mono text-sm"
                    style={{ color: data.priceChange >= 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {data.priceChange >= 0 ? "+" : ""}
                    {data.priceChange.toFixed(2)} ({data.priceChangePct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div
                  className="rounded-xl px-5 py-2 text-center font-bold text-xl"
                  style={{ background: cfg.color, color: "#fff", minWidth: 80 }}
                >
                  {cfg.label}
                </div>
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  종합점수 {data.score}/100
                </span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {data.reasoning}
            </p>

            {data.keyPoints.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {data.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <span style={{ color: cfg.color }}>·</span>
                    {pt}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Score breakdown */}
          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <p className="mb-4 text-xs font-medium" style={{ color: "var(--muted)" }}>
              항목별 점수
            </p>
            <div className="flex flex-col gap-3">
              {Object.entries(data.scores).map(([key, score]) => (
                <ScoreBar key={key} label={SCORE_LABELS[key] ?? key} score={score} />
              ))}
            </div>
          </div>

          {/* Technical indicators */}
          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <p className="mb-4 text-xs font-medium" style={{ color: "var(--muted)" }}>
              기술적 지표
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  label: "RSI(14)",
                  value: data.rsi,
                  note: data.rsi < 30 ? "과매도" : data.rsi > 70 ? "과매수" : "중립",
                  noteColor: data.rsi < 30 ? "#22c55e" : data.rsi > 70 ? "#ef4444" : "var(--muted)",
                },
                {
                  label: "SMA 20",
                  value: data.market === "KR"
                    ? Math.round(data.sma20).toLocaleString()
                    : data.sma20.toFixed(2),
                  note: data.price >= data.sma20 ? "상회" : "하회",
                  noteColor: data.price >= data.sma20 ? "#22c55e" : "#ef4444",
                },
                {
                  label: "SMA 50",
                  value: data.market === "KR"
                    ? Math.round(data.sma50).toLocaleString()
                    : data.sma50.toFixed(2),
                  note: data.price >= data.sma50 ? "상회" : "하회",
                  noteColor: data.price >= data.sma50 ? "#22c55e" : "#ef4444",
                },
              ].map((ind) => (
                <div key={ind.label} className="flex flex-col gap-0.5">
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>{ind.label}</span>
                  <span className="font-mono text-base font-medium">{ind.value}</span>
                  <span className="text-[10px]" style={{ color: ind.noteColor }}>{ind.note}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[10px]" style={{ color: "var(--muted)" }}>
            분석 시각: {new Date(data.analysisAt).toLocaleString("ko-KR")} · 투자 손익의 책임은 본인에게 있습니다
          </p>
        </div>
      )}
    </div>
  );
}
