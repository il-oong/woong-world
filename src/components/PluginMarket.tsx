"use client";

import { useEffect, useState } from "react";
import {
  MARKET_CATEGORIES,
  pluginIdFromRepo,
  type MarketCategoryId,
  type MarketItem,
  type MarketSort,
} from "@/lib/plugin-market";

const SORT_LABELS: Record<MarketSort, string> = {
  stars: "⭐ 인기순",
  updated: "🕒 최신순",
  forks: "🍴 포크순",
};

const ERROR_LABELS: Record<string, string> = {
  rate_limited:
    "GitHub 요청 한도에 걸렸어요. 잠시 후 다시 시도하거나 GITHUB_TOKEN을 설정하세요.",
  forbidden: "관리자만 볼 수 있어요.",
};

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function PluginMarket() {
  const [category, setCategory] = useState<MarketCategoryId>("ai");
  const [sort, setSort] = useState<MarketSort>("stars");
  const [result, setResult] = useState<{
    key: string;
    items: MarketItem[];
    error: string | null;
  } | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const key = `${category}:${sort}`;
  const loading = result?.key !== key;
  const items = result && !loading ? result.items : [];
  const error = result && !loading ? result.error : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plugins")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { plugins: { repo: string }[] } | null) => {
        if (cancelled || !data) return;
        setInstalled(new Set(data.plugins.map((p) => p.repo.toLowerCase())));
      })
      .catch(() => {
        /* 설치 표시는 부가 정보 — 실패해도 목록은 보여준다 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const k = `${category}:${sort}`;
    fetch(`/api/plugins/market?category=${category}&sort=${sort}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          items?: MarketItem[];
          error?: string;
        };
        if (cancelled) return;
        setResult(
          res.ok
            ? { key: k, items: data.items ?? [], error: null }
            : { key: k, items: [], error: data.error ?? `failed_${res.status}` },
        );
      })
      .catch(() => {
        if (!cancelled) setResult({ key: k, items: [], error: "network" });
      });
    return () => {
      cancelled = true;
    };
  }, [category, sort]);

  // 목록이 뜬 뒤 한 줄 요약을 비동기로 채운다 (Gemini + Redis 캐시).
  useEffect(() => {
    if (!result || result.items.length === 0) return;
    let cancelled = false;
    fetch("/api/plugins/market/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: result.items.map((i) => ({
          repo: i.repo,
          description: i.description,
          topics: i.topics,
          language: i.language,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summaries?: Record<string, string> } | null) => {
        if (cancelled || !data?.summaries) return;
        setSummaries((prev) => ({ ...prev, ...data.summaries }));
      })
      .catch(() => {
        /* 요약 실패 시 원래 설명만 보여준다 */
      });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const install = async (it: MarketItem) => {
    const id = pluginIdFromRepo(it.repo);
    if (!id) {
      setNotice(`"${it.repo}" 는 허브 id로 변환할 수 없어요.`);
      return;
    }
    setBusy(it.repo);
    setNotice(null);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: it.name,
          description: it.description,
          repo: it.repo,
          branch: it.branch,
          url: it.homepage && /^https?:\/\//.test(it.homepage) ? it.homepage : null,
          tags: it.topics.slice(0, 4),
          embeddable: false,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        setNotice(`이미 같은 id(${id})의 플러그인이 있어요.`);
      } else if (!res.ok) {
        setNotice(`추가 실패: ${data.error ?? res.status}`);
      } else {
        setInstalled((prev) => new Set(prev).add(it.repo.toLowerCase()));
        setNotice(`"${it.name}" 을(를) 허브에 추가했어요.`);
      }
    } finally {
      setBusy(null);
    }
  };

  const active = MARKET_CATEGORIES.find((c) => c.id === category)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MARKET_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              c.id === category
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-foreground"
                : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">{active.description}</p>
        <div className="flex gap-1">
          {(Object.keys(SORT_LABELS) as MarketSort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                s === sort
                  ? "border-[var(--accent)] text-foreground"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-foreground"
              }`}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p className="mt-3 rounded-md border border-[var(--border)] px-3 py-2 text-xs">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-[var(--muted)]">불러오는 중…</p>
      ) : error ? (
        <p className="mt-8 text-sm text-red-300">
          {ERROR_LABELS[error] ?? `불러오기 실패: ${error}`}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted)]">결과가 없어요.</p>
      ) : (
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((it, i) => {
            const has = installed.has(it.repo.toLowerCase());
            return (
              <li
                key={it.repo}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono text-sm text-[var(--accent)]">
                    #{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={it.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-medium hover:underline"
                    >
                      {it.repo}
                    </a>
                    {summaries[it.repo] && (
                      <p className="mt-1 text-xs font-medium text-emerald-200">
                        💡 {summaries[it.repo]}
                      </p>
                    )}
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                      {it.description || "설명 없음"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                  <span>⭐ {fmt(it.stars)}</span>
                  <span>🍴 {fmt(it.forks)}</span>
                  {it.language && <span>{it.language}</span>}
                  {it.license && <span>{it.license}</span>}
                  <span>갱신 {it.updatedAt.slice(0, 10)}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={has || busy === it.repo}
                    onClick={() => void install(it)}
                    className="rounded-md border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    {has ? "✓ 허브에 있음" : busy === it.repo ? "추가 중…" : "허브에 추가"}
                  </button>
                  <a
                    href={it.zipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-foreground"
                  >
                    ZIP 다운로드
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
