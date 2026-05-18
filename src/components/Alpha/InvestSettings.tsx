"use client";

import { useEffect, useState } from "react";
import type { InvestSettings } from "@/lib/alpha";

type TraderKey = keyof InvestSettings["traderWeights"];

const TRADERS: { key: TraderKey; label: string; desc: string }[] = [
  { key: "livermore", label: "Livermore", desc: "추세 추종 · 집중 베팅" },
  { key: "oneil", label: "O'Neil", desc: "CANSLIM · 성장주 · 손절 엄수" },
  { key: "weinstein", label: "Weinstein", desc: "스테이지 분석 · 장기 추세" },
  { key: "minervini", label: "Minervini", desc: "VCP · 저변동성 돌파" },
  { key: "lynch", label: "Lynch", desc: "성장 + 가치 · 텐배거" },
];

const DEFAULT: InvestSettings = {
  traderWeights: { livermore: 20, oneil: 20, weinstein: 20, minervini: 20, lynch: 20 },
  defaultStopLossRate: 7,
};

export default function InvestSettings() {
  const [settings, setSettings] = useState<InvestSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/alpha/settings")
      .then((r) => r.json())
      .then((d) => { setSettings(d as InvestSettings); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const total = Object.values(settings.traderWeights).reduce((a, b) => a + b, 0);

  const handleWeight = (key: TraderKey, value: number) => {
    setSettings((s) => ({
      ...s,
      traderWeights: { ...s.traderWeights, [key]: Math.max(0, Math.min(100, value)) },
    }));
    setSaved(false);
  };

  const normalize = () => {
    const weights = settings.traderWeights;
    const keys = Object.keys(weights) as TraderKey[];
    const t = keys.reduce((a, k) => a + weights[k], 0);
    if (t === 0) {
      setSettings((s) => ({
        ...s,
        traderWeights: { livermore: 20, oneil: 20, weinstein: 20, minervini: 20, lynch: 20 },
      }));
      return;
    }
    const normalized = {} as InvestSettings["traderWeights"];
    let sum = 0;
    keys.forEach((k, i) => {
      const v = i === keys.length - 1 ? 100 - sum : Math.round((weights[k] / t) * 100);
      normalized[k] = v;
      sum += v;
    });
    setSettings((s) => ({ ...s, traderWeights: normalized }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/alpha/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <p className="text-xs text-zinc-600 py-8 text-center">불러오는 중…</p>;

  return (
    <div className="space-y-6">
      {/* Trader Weights */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-300">트레이더 가중치</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono ${total === 100 ? "text-emerald-400" : "text-rose-400"}`}>
              합계 {total}%
            </span>
            {total !== 100 && (
              <button
                type="button"
                onClick={normalize}
                className="rounded px-2 py-0.5 text-[10px] border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
              >
                100으로 정규화
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {TRADERS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <p className="text-xs text-zinc-300">{label}</p>
                <p className="text-[10px] text-zinc-600">{desc}</p>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.traderWeights[key]}
                onChange={(e) => handleWeight(key, Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={settings.traderWeights[key]}
                onChange={(e) => handleWeight(key, Number(e.target.value))}
                className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-center text-xs text-white focus:outline-none focus:border-amber-500/50"
              />
              <span className="text-xs text-zinc-600 w-4">%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Default Stop Loss */}
      <div>
        <p className="text-xs font-medium text-zinc-300 mb-3">기본 손절률</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={20}
            value={settings.defaultStopLossRate}
            onChange={(e) => {
              setSettings((s) => ({ ...s, defaultStopLossRate: Number(e.target.value) }));
              setSaved(false);
            }}
            className="flex-1 accent-amber-500"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={settings.defaultStopLossRate}
            onChange={(e) => {
              setSettings((s) => ({ ...s, defaultStopLossRate: Number(e.target.value) }));
              setSaved(false);
            }}
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-center text-xs text-white focus:outline-none focus:border-amber-500/50"
          />
          <span className="text-xs text-zinc-600 w-4">%</span>
        </div>
        <p className="mt-1 text-[10px] text-zinc-600">JKP 분석 시 기본 손절 기준으로 사용됩니다</p>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || total !== 100}
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
      >
        {saving ? "저장 중…" : saved ? "저장됨 ✓" : "저장"}
      </button>
      {total !== 100 && (
        <p className="text-[10px] text-rose-400">가중치 합계가 100%여야 저장할 수 있습니다</p>
      )}
    </div>
  );
}
