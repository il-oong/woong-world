"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CATEGORIES,
  getCategory,
  setRuntimeCategories,
  type Category,
  type CategoryId,
} from "@/lib/categories";
import {
  currentPeriodKey,
  type Plan,
  type PlanItem,
  type PlanPeriod,
} from "@/lib/plans";

type Status = {
  storage: boolean;
  ai: boolean;
};

type ReviewResult = {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggestions: string[];
  raw: string;
};

const PERIOD_TABS: { id: PlanPeriod; label: string }[] = [
  { id: "weekly", label: "주간" },
  { id: "monthly", label: "월간" },
  { id: "yearly", label: "연간" },
];

export function PlansPanel() {
  const [period, setPeriod] = useState<PlanPeriod>("weekly");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const fetchKey = `${period}|${refresh}`;
  const loading = status?.storage === true && loadedKey !== fetchKey;
  const [creating, setCreating] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    CategoryId | "all"
  >("all");
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.ok ? r.json() as Promise<{ categories: Category[] }> : null)
      .then((data) => {
        if (data?.categories?.length) {
          setCategories(data.categories);
          setRuntimeCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);

  // AI review modal state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");

  useEffect(() => {
    fetch("/api/plans/status")
      .then((r) => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus({ storage: false, ai: false }));
  }, []);

  useEffect(() => {
    if (!status?.storage) return;
    let cancelled = false;
    fetch(`/api/plans?period=${period}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ plans: Plan[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPlans(data.plans);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(fetchKey);
      });
    return () => {
      cancelled = true;
    };
  }, [period, refresh, status?.storage, fetchKey]);

  const filteredPlans = useMemo(() => {
    if (activeCategoryFilter === "all") return plans;
    return plans.filter((p) => p.categoryId === activeCategoryFilter);
  }, [plans, activeCategoryFilter]);

  const handleCreate = async (input: {
    title: string;
    categoryId: CategoryId | null;
    periodKey: string;
    items: { text: string }[];
    notes: string;
  }) => {
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period,
        ...input,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "create_failed");
    }
    setRefresh((v) => v + 1);
  };

  const handleUpdate = async (id: string, patch: Partial<Plan>) => {
    const res = await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    setRefresh((v) => v + 1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 계획을 삭제할까요?")) return;
    await fetch(`/api/plans/${id}`, { method: "DELETE" });
    setRefresh((v) => v + 1);
  };

  const reviewOne = async (plan: Plan) => {
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewError(null);
    setReviewResult(null);
    setReviewTitle(plan.title);
    try {
      const res = await fetch("/api/plans/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = (await res.json()) as
        | { review: ReviewResult }
        | { error: string };
      if (!res.ok || !("review" in data)) {
        throw new Error(("error" in data && data.error) || "review_failed");
      }
      setReviewResult(data.review);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "review_failed");
    } finally {
      setReviewLoading(false);
    }
  };

  const reviewAll = async () => {
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewError(null);
    setReviewResult(null);
    setReviewTitle("전체 포트폴리오");
    try {
      const res = await fetch("/api/plans/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: true }),
      });
      const data = (await res.json()) as
        | { review: ReviewResult }
        | { error: string };
      if (!res.ok || !("review" in data)) {
        throw new Error(("error" in data && data.error) || "review_failed");
      }
      setReviewResult(data.review);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "review_failed");
    } finally {
      setReviewLoading(false);
    }
  };

  if (!status) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
        상태 확인 중...
      </div>
    );
  }

  if (!status.storage) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-200/90">
        <p className="font-medium">계획 저장소가 설정되지 않았습니다.</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
          Vercel 환경 변수에 다음을 추가하세요 (Upstash Redis 무료 티어):
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-amber-100/90">{`UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GEMINI_API_KEY=...   (AI 리뷰용, 선택)`}</pre>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/60">
          Vercel Dashboard → Storage → Marketplace → Upstash for Redis 1-click
          설치하면 두 개 변수가 자동 주입됩니다. Gemini 키는{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            aistudio.google.com/apikey
          </a>
          에서 발급.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
          {PERIOD_TABS.map((tab) => {
            const active = period === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriod(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs transition ${
                  active
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black hover:bg-[var(--accent)]/90"
          >
            + 계획
          </button>
          {status.ai && plans.length > 0 && (
            <button
              type="button"
              onClick={reviewAll}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5"
              title="Gemini 2.5 Flash Lite로 전체 포트폴리오 리뷰"
            >
              ✨ 전체 리뷰
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryFilterChip
          label="전체"
          active={activeCategoryFilter === "all"}
          onClick={() => setActiveCategoryFilter("all")}
        />
        {categories.map((cat) => (
          <CategoryFilterChip
            key={cat.id}
            label={cat.label}
            color={cat.color}
            bg={cat.bg}
            border={cat.border}
            active={activeCategoryFilter === cat.id}
            onClick={() => setActiveCategoryFilter(cat.id)}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300/90">
          {error}
        </div>
      )}

      {loading && (
        <p className="py-8 text-center text-xs text-[var(--muted)]">
          불러오는 중...
        </p>
      )}

      {!loading && filteredPlans.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          아직 계획이 없습니다. 우측 상단 <span className="text-foreground">+ 계획</span>으로 추가해보세요.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filteredPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            aiAvailable={status.ai}
            onUpdate={(patch) => handleUpdate(plan.id, patch)}
            onDelete={() => handleDelete(plan.id)}
            onReview={() => reviewOne(plan)}
          />
        ))}
      </div>

      {creating && (
        <NewPlanForm
          period={period}
          defaultPeriodKey={currentPeriodKey(period)}
          categories={categories}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await handleCreate(input);
            setCreating(false);
          }}
        />
      )}

      {reviewOpen && (
        <ReviewModal
          title={reviewTitle}
          loading={reviewLoading}
          error={reviewError}
          result={reviewResult}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}

function CategoryFilterChip({
  label,
  color,
  bg,
  border,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  bg?: string;
  border?: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = color ?? "var(--accent)";
  const accentBg = bg ?? "color-mix(in oklab, var(--accent) 15%, transparent)";
  const accentBorder =
    border ?? "color-mix(in oklab, var(--accent) 45%, transparent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition"
      style={{
        borderColor: active ? accentBorder : "var(--border)",
        background: active ? accentBg : "transparent",
        color: active ? accent : "var(--muted)",
      }}
    >
      {color && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </button>
  );
}

function PlanCard({
  plan,
  aiAvailable,
  onUpdate,
  onDelete,
  onReview,
}: {
  plan: Plan;
  aiAvailable: boolean;
  onUpdate: (patch: Partial<Plan>) => void;
  onDelete: () => void;
  onReview: () => void;
}) {
  const cat = plan.categoryId ? getCategory(plan.categoryId) : null;
  const [newItem, setNewItem] = useState("");
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState(plan.notes);
  const [lastSyncedNotes, setLastSyncedNotes] = useState(plan.notes);
  if (lastSyncedNotes !== plan.notes) {
    // Sync draft when remote notes change (without an effect).
    setLastSyncedNotes(plan.notes);
    if (!notesEditing) setNotesDraft(plan.notes);
  }

  const toggleItem = (id: string) => {
    const next = plan.items.map((it) =>
      it.id === id ? { ...it, done: !it.done } : it,
    );
    onUpdate({ items: next });
  };

  const removeItem = (id: string) => {
    onUpdate({ items: plan.items.filter((it) => it.id !== id) });
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    const item: PlanItem = {
      id: `it_${Math.random().toString(36).slice(2, 10)}`,
      text,
      done: false,
    };
    onUpdate({ items: [...plan.items, item] });
    setNewItem("");
  };

  const doneCount = plan.items.filter((i) => i.done).length;
  const progress =
    plan.items.length === 0
      ? 0
      : Math.round((doneCount / plan.items.length) * 100);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-[var(--card)] p-4"
      style={{
        borderColor: cat ? cat.border : "var(--border)",
        borderLeftWidth: cat ? "3px" : "1px",
        borderLeftColor: cat?.color,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
            <span>{plan.periodKey}</span>
            {cat && (
              <span
                className="rounded px-1.5 py-0.5"
                style={{ background: cat.bg, color: cat.color }}
              >
                {cat.label}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium">{plan.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {aiAvailable && (
            <button
              type="button"
              onClick={onReview}
              className="rounded p-1 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
              title="AI 리뷰"
            >
              ✨
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete"
            className="rounded p-1 text-xs text-[var(--muted)] hover:text-rose-300"
          >
            ✕
          </button>
        </div>
      </div>

      {plan.items.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: cat?.color ?? "var(--accent)",
              }}
            />
          </div>
          <span className="font-mono">
            {doneCount}/{plan.items.length}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {plan.items.map((it) => (
          <div
            key={it.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/[0.02]"
          >
            <button
              type="button"
              onClick={() => toggleItem(it.id)}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition ${
                it.done
                  ? "border-transparent text-black"
                  : "border-[var(--border)] text-transparent hover:border-[var(--accent)]"
              }`}
              style={
                it.done
                  ? {
                      background: cat?.color ?? "var(--accent)",
                      color: "#000",
                    }
                  : undefined
              }
              aria-label={it.done ? "완료 해제" : "완료"}
            >
              ✓
            </button>
            <span
              className={`flex-1 text-xs ${
                it.done ? "text-[var(--muted)] line-through" : "text-foreground"
              }`}
            >
              {it.text}
            </span>
            <button
              type="button"
              onClick={() => removeItem(it.id)}
              className="opacity-0 transition group-hover:opacity-100 text-xs text-[var(--muted)] hover:text-rose-300"
              aria-label="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="+ 항목 추가"
          className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-xs focus:border-[var(--accent)]/50 focus:outline-none"
        />
      </div>

      <div className="border-t border-[var(--border)] pt-2">
        {notesEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs focus:border-[var(--accent)]/50 focus:outline-none"
              placeholder="메모"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotesDraft(plan.notes);
                  setNotesEditing(false);
                }}
                className="rounded px-2 py-1 text-[11px] text-[var(--muted)] hover:text-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdate({ notes: notesDraft });
                  setNotesEditing(false);
                }}
                className="rounded bg-[var(--accent)]/15 px-2 py-1 text-[11px] text-[var(--accent)]"
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNotesEditing(true)}
            className="w-full rounded text-left text-[11px] text-[var(--muted)] hover:text-foreground"
          >
            {plan.notes || "메모 추가..."}
          </button>
        )}
      </div>
    </div>
  );
}

function NewPlanForm({
  period,
  defaultPeriodKey,
  categories,
  onClose,
  onSubmit,
}: {
  period: PlanPeriod;
  defaultPeriodKey: string;
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    categoryId: CategoryId | null;
    periodKey: string;
    items: { text: string }[];
    notes: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [periodKey, setPeriodKey] = useState(defaultPeriodKey);
  const [categoryId, setCategoryId] = useState<CategoryId | null>(
    categories[0]?.id ?? null,
  );
  const [itemsText, setItemsText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!title.trim()) {
      setError("제목을 입력하세요");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const items = itemsText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
      await onSubmit({
        title: title.trim(),
        categoryId,
        periodKey: periodKey.trim() || defaultPeriodKey,
        items,
        notes: notes.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const periodLabel =
    period === "weekly" ? "주간" : period === "monthly" ? "월간" : "연간";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[#101015] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-medium">새 {periodLabel} 계획</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 p-5">
          <FormField label="기간 키">
            <input
              type="text"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-sm focus:border-[var(--accent)]/50 focus:outline-none"
              placeholder={defaultPeriodKey}
            />
          </FormField>

          <FormField label="카테고리">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  categoryId === null
                    ? "border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                전체
              </button>
              {categories.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className="rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: active ? cat.border : "var(--border)",
                      background: active ? cat.bg : "transparent",
                      color: active ? cat.color : "var(--muted)",
                    }}
                  >
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: cat.color }}
                    />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField label="제목">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
              placeholder="이번 주 목표, Q1 OKR, ..."
            />
          </FormField>

          <FormField label="항목 (한 줄에 하나)">
            <textarea
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs focus:border-[var(--accent)]/50 focus:outline-none"
              placeholder={"운동 3회\n책 2권\n프로젝트 마일스톤 1"}
            />
          </FormField>

          <FormField label="메모">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs focus:border-[var(--accent)]/50 focus:outline-none"
            />
          </FormField>

          {error && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewModal({
  title,
  loading,
  error,
  result,
  onClose,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  result: ReviewResult | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[#101015] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs">✨</span>
            <h2 className="text-sm font-medium">AI 리뷰 — {title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading && (
            <p className="py-8 text-center text-xs text-[var(--muted)]">
              Gemini가 검토 중...
            </p>
          )}
          {error && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {error}
            </div>
          )}
          {result && !loading && (
            <div className="flex flex-col gap-4 text-sm">
              {result.summary && (
                <div>
                  <h3 className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
                    요약
                  </h3>
                  <p className="leading-relaxed">{result.summary}</p>
                </div>
              )}
              {result.strengths.length > 0 && (
                <ReviewSection
                  label="좋은 점"
                  color="#46d6db"
                  items={result.strengths}
                />
              )}
              {result.gaps.length > 0 && (
                <ReviewSection
                  label="빠진/걱정되는 점"
                  color="#ffa726"
                  items={result.gaps}
                />
              )}
              {result.suggestions.length > 0 && (
                <ReviewSection
                  label="제안"
                  color="#a36ee0"
                  items={result.suggestions}
                />
              )}
              {result.summary === "" &&
                result.strengths.length === 0 &&
                result.gaps.length === 0 &&
                result.suggestions.length === 0 && (
                  <pre className="whitespace-pre-wrap break-words text-xs text-[var(--muted)]">
                    {result.raw}
                  </pre>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({
  label,
  color,
  items,
}: {
  label: string;
  color: string;
  items: string[];
}) {
  return (
    <div>
      <h3
        className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider"
        style={{ color }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
        {label}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed">
            <span className="text-[var(--muted)]">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
