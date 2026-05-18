"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarWidget } from "./CalendarWidget";
import { BriefingPlayer } from "./BriefingPlayer";
import { TodoHomeWidget } from "./TodoHomeWidget";
import { RoutineHomeWidget } from "./RoutineHomeWidget";

type WidgetId =
  | "briefing"
  | "calendar"
  | "plans"
  | "todo"
  | "routine"
  | "subscription"
  | "alpha";

const STORAGE_KEY = "wh-dashboard-config";

type DashboardConfig = {
  order: WidgetId[];
  hidden: WidgetId[];
};

type WidgetMeta = {
  id: WidgetId;
  label: string;
  span: 1 | 2;
  adminOnly?: boolean;
};

const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  briefing: { id: "briefing", label: "아침 브리핑", span: 2 },
  calendar: { id: "calendar", label: "캘린더", span: 2 },
  plans: { id: "plans", label: "계획 관리", span: 1 },
  todo: { id: "todo", label: "할 일", span: 1 },
  routine: { id: "routine", label: "루틴 트래커", span: 1, adminOnly: true },
  subscription: {
    id: "subscription",
    label: "구독 관리",
    span: 1,
    adminOnly: true,
  },
  alpha: { id: "alpha", label: "ALPHA 투자 분석", span: 1 },
};

const DEFAULT_ORDER: WidgetId[] = [
  "briefing",
  "calendar",
  "plans",
  "todo",
  "alpha",
  "routine",
  "subscription",
];

function loadConfig(): DashboardConfig {
  if (typeof window === "undefined") {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { order: DEFAULT_ORDER, hidden: [] };
    const parsed = JSON.parse(stored) as Partial<DashboardConfig>;
    return {
      order: Array.isArray(parsed.order)
        ? (parsed.order as WidgetId[])
        : DEFAULT_ORDER,
      hidden: Array.isArray(parsed.hidden) ? (parsed.hidden as WidgetId[]) : [],
    };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

function saveConfig(c: DashboardConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export function HomeDashboard({
  isAdmin,
  secretaryName,
}: {
  isAdmin: boolean;
  secretaryName: string;
}) {
  const [config, setConfig] = useState<DashboardConfig>({
    order: DEFAULT_ORDER,
    hidden: [],
  });
  const [editMode, setEditMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setMounted(true);
  }, []);

  const updateConfig = (next: DashboardConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  // Filter to widgets the current user is allowed to see.
  const availableIds: WidgetId[] = (Object.keys(WIDGET_META) as WidgetId[]).filter(
    (id) => !WIDGET_META[id].adminOnly || isAdmin,
  );
  const availableSet = new Set(availableIds);

  // Resolve final ordering: respect stored order, then append newly-added widgets.
  const inConfig = new Set(config.order);
  const orphans = availableIds.filter((id) => !inConfig.has(id));
  const allOrdered: WidgetId[] = [
    ...config.order.filter((id) => availableSet.has(id)),
    ...orphans,
  ];

  const hiddenSet = new Set(config.hidden);
  const visible = allOrdered.filter((id) => !hiddenSet.has(id));
  const hiddenList = allOrdered.filter((id) => hiddenSet.has(id));

  const move = (id: WidgetId, dir: -1 | 1) => {
    const idx = visible.indexOf(id);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= visible.length) return;
    const targetId = visible[newIdx];
    const fromAll = allOrdered.indexOf(id);
    const toAll = allOrdered.indexOf(targetId);
    const newOrder = [...allOrdered];
    [newOrder[fromAll], newOrder[toAll]] = [newOrder[toAll], newOrder[fromAll]];
    updateConfig({ ...config, order: newOrder });
  };

  const hide = (id: WidgetId) => {
    updateConfig({ ...config, hidden: [...config.hidden, id] });
  };

  const unhide = (id: WidgetId) => {
    updateConfig({ ...config, hidden: config.hidden.filter((x) => x !== id) });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`rounded-md border px-3 py-1 text-xs transition ${
            editMode
              ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground"
          }`}
        >
          {editMode ? "편집 완료" : "위젯 편집"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((id, idx) => {
          const meta = WIDGET_META[id];
          const span = meta.span === 2 ? "lg:col-span-2" : "";
          return (
            <div key={id} className={`flex min-w-0 flex-col ${span}`}>
              {editMode && mounted && (
                <div className="mb-1 flex items-center justify-between rounded-md border border-[var(--accent)]/40 bg-black/40 px-3 py-1.5 text-[11px]">
                  <span className="font-medium text-foreground">{meta.label}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(id, -1)}
                      disabled={idx === 0}
                      className="rounded px-1.5 py-0.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                      aria-label="위로"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(id, 1)}
                      disabled={idx === visible.length - 1}
                      className="rounded px-1.5 py-0.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-foreground disabled:opacity-30"
                      aria-label="아래로"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => hide(id)}
                      className="rounded px-1.5 py-0.5 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      숨김
                    </button>
                  </div>
                </div>
              )}
              <div className="flex-1">
                <Widget id={id} secretaryName={secretaryName} />
              </div>
            </div>
          );
        })}
      </div>

      {editMode && mounted && hiddenList.length > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
            숨김 위젯
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenList.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => unhide(id)}
                className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-foreground"
              >
                + {WIDGET_META[id].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Widget({
  id,
  secretaryName,
}: {
  id: WidgetId;
  secretaryName: string;
}) {
  switch (id) {
    case "briefing":
      return <BriefingPlayer secretaryName={secretaryName} />;
    case "calendar":
      return <CalendarWidget />;
    case "plans":
      return (
        <LinkCard
          href="/plans"
          accentClass="text-[var(--accent)]"
          hoverClass="hover:border-[var(--accent)]/50"
          kicker="biseo / plans"
          title="계획 관리"
          desc="주간 / 월간 / 연간 계획을 카테고리별로 정리하고 Gemini로 보완점을 받습니다."
          footer="인생 · 회사 · VFX · 앱개발 · 재즈"
        />
      );
    case "todo":
      return <TodoHomeWidget />;
    case "routine":
      return <RoutineHomeWidget />;
    case "subscription":
      return (
        <LinkCard
          href="/apps/subscription"
          accentClass="text-amber-300"
          hoverClass="hover:border-amber-400/40"
          kicker="biseo / subscription"
          title="구독 관리"
          desc="결제일 자동 캘린더 등록 + 월 합산."
          footer="캘린더 연동 · 비용"
        />
      );
    case "alpha":
      return (
        <LinkCard
          href="/apps/alpha"
          accentClass="text-amber-400"
          hoverClass="hover:border-amber-500/40"
          kicker="biseo / alpha"
          title="ALPHA 투자 분석"
          desc="JKP AI 분석으로 매수·매도 시점을 단정적으로 제시합니다. 포트폴리오·관심종목·경제 캘린더 통합."
          footer="JKP 분석 · 포트폴리오 · 경제 캘린더"
        />
      );
  }
}

function LinkCard({
  href,
  accentClass,
  hoverClass,
  kicker,
  title,
  desc,
  footer,
}: {
  href: string;
  accentClass: string;
  hoverClass: string;
  kicker: string;
  title: string;
  desc: string;
  footer: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition ${hoverClass}`}
    >
      <div>
        <p
          className={`font-mono text-[10px] uppercase tracking-[0.3em] ${accentClass}`}
        >
          {kicker}
        </p>
        <h2 className="mt-2 text-base font-medium">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{desc}</p>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-[var(--muted)] group-hover:text-foreground">
        <span>{footer}</span>
        <span>→</span>
      </div>
    </Link>
  );
}
