"use client";

import { useEffect, useState } from "react";
import type { CryptoSettings, CryptoTraderWeights } from "@/lib/crypto";

const TRADERS: { key: keyof CryptoTraderWeights; label: string; desc: string }[] = [
  { key: "saylor", label: "Michael Saylor", desc: "BTC 맥시멀리스트 · 장기 hodl" },
  { key: "hayes", label: "Arthur Hayes", desc: "매크로 파생 · 펀딩비·옵션" },
  { key: "planb", label: "PlanB", desc: "S2F · 반감기 사이클" },
  { key: "pal", label: "Raoul Pal", desc: "글로벌 매크로 · Exponential Age" },
  { key: "woo", label: "Willy Woo", desc: "온체인 지표 (NVT/MVRV)" },
];

export default function CryptoInvestSettings() {
  const [settings, setSettings] = useState<CryptoSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/crypto/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d as CryptoSettings))
      .catch(() => setSettings(null));
  }, []);

  if (!settings) {
    return <p className="text-xs text-zinc-600 py-8 text-center animate-pulse">불러오는 중…</p>;
  }

  const total = TRADERS.reduce((sum, t) => sum + (settings.traderWeights[t.key] ?? 0), 0);

  const setWeight = (key: keyof CryptoTraderWeights, v: number) => {
    setSettings((s) => (s ? { ...s, traderWeights: { ...s.traderWeights, [key]: v } } : s));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crypto/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-zinc-300 font-medium mb-1">트레이더 가중치</p>
        <p className="text-[10px] text-zinc-600">
          추천 생성·리뷰 시 각 트레이더 관점에 부여할 영향력. 합계는 자유 (가중치 비율로 해석).
        </p>
      </div>

      <div className="space-y-3">
        {TRADERS.map((t) => {
          const v = settings.traderWeights[t.key] ?? 0;
          return (
            <div key={t.key} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="text-xs text-zinc-200 font-medium">{t.label}</span>
                  <span className="text-[10px] text-zinc-500 ml-2">{t.desc}</span>
                </div>
                <span className="font-mono text-xs text-amber-300">{v}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={v}
                onChange={(e) => setWeight(t.key, Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div>
          <p className="text-xs text-zinc-300">기본 손절률</p>
          <p className="text-[10px] text-zinc-600">진입 플랜에서 손절 기본값으로 사용</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={50}
            step={1}
            value={settings.defaultStopLossRate}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, defaultStopLossRate: Number(e.target.value) || 0 } : s,
              )
            }
            className="w-16 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-right text-xs text-zinc-200"
          />
          <span className="text-xs text-zinc-500">%</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-zinc-600">
          합계: <span className="font-mono text-zinc-400">{total}%</span>
        </p>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-[10px] text-emerald-400">
              저장됨 · {new Date(savedAt).toLocaleTimeString("ko-KR")}
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
