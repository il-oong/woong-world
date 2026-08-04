"use client";

import { Fragment, useState } from "react";
import { CATEGORIES, getCategory } from "@/lib/categories";
import type {
  CategoryId,
  Category,
} from "@/lib/categories";
import type {
  ChatMessage,
  ProposedAction,
  UploadedFile,
} from "@/lib/assistant";
import type { PlanPeriod, UpdatePlanInput } from "@/lib/plans";
import { fileIcon } from "./AssistantPanel";

export function AssistantMessage({
  message,
  fileById,
  onAction,
}: {
  message: ChatMessage;
  fileById: Map<string, UploadedFile>;
  onAction: (
    messageId: string,
    actionId: string,
    decision: "approve" | "reject",
    params?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`my-3 flex flex-col gap-1.5 ${
        isUser ? "items-end" : "items-start"
      }`}
    >
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-[var(--accent)]/15 text-foreground"
            : "bg-white/[0.04] text-foreground"
        }`}
      >
        <LinkifiedText text={message.text} />
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.attachments.map((a) => {
            const f = fileById.get(a.fileId);
            return (
              <span
                key={a.fileId}
                className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/20 px-2 py-0.5 text-[10px] text-[var(--muted)]"
              >
                {fileIcon(a.kind)} {f?.name ?? a.name}
              </span>
            );
          })}
        </div>
      )}

      {!isUser &&
        message.proposedActions?.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onAction={(decision, params) =>
              onAction(message.id, action.id, decision, params)
            }
          />
        ))}
    </div>
  );
}

function ActionCard({
  action,
  onAction,
}: {
  action: ProposedAction;
  onAction: (
    decision: "approve" | "reject",
    params?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const decide = async (
    decision: "approve" | "reject",
    params?: Record<string, unknown>,
  ) => {
    setBusy(true);
    try {
      await onAction(decision, params);
    } finally {
      setBusy(false);
      setEditing(false);
    }
  };

  return (
    <div className="w-full max-w-[88%] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] bg-white/[0.02] px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
            {labelForType(action.type)}
          </span>
          <StatusBadge status={action.status} />
        </div>
      </div>

      {!editing ? (
        <>
          <div className="px-3 py-2.5 text-xs leading-relaxed">
            {action.type === "add_event" && (
              <AddEventBody params={action.params} />
            )}
            {action.type === "create_plan" && (
              <CreatePlanBody params={action.params} />
            )}
            {action.type === "update_plan" && (
              <UpdatePlanBody params={action.params} />
            )}
            {action.type === "suggest_command" && (
              <SuggestCommandBody params={action.params} />
            )}
            {action.type === "create_routine" && (
              <CreateRoutineBody params={action.params} />
            )}
            {action.type === "manage_workspace" && (
              <WorkspaceActionBody params={action.params} />
            )}
          </div>

          {action.status === "pending" && action.type === "suggest_command" && (
            <SuggestCommandActions
              cmd={action.params.cmd}
              busy={busy}
              onDone={() => void decide("approve")}
              onReject={() => void decide("reject")}
            />
          )}

          {action.status === "pending" && action.type !== "suggest_command" && (
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
              <button
                type="button"
                onClick={() => void decide("reject")}
                disabled={busy}
                className="rounded-md px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
              >
                거절
              </button>
              {action.type !== "manage_workspace" && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
                >
                  수정
                </button>
              )}
              <button
                type="button"
                onClick={() => void decide("approve")}
                disabled={busy}
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
              >
                {busy ? "..." : "승인"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-2.5">
          {action.type === "add_event" && (
            <AddEventEdit
              params={action.params}
              busy={busy}
              onApprove={(p) => void decide("approve", p)}
              onCancel={() => setEditing(false)}
            />
          )}
          {action.type === "create_plan" && (
            <CreatePlanEdit
              params={action.params}
              busy={busy}
              onApprove={(p) => void decide("approve", p)}
              onCancel={() => setEditing(false)}
            />
          )}
          {action.type === "update_plan" && (
            <UpdatePlanEdit
              params={action.params}
              busy={busy}
              onApprove={(p) => void decide("approve", p)}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Preview bodies ──────────────────────────────────────────────────────────

function AddEventBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "add_event" }>["params"];
}) {
  const cat = params.categoryId ? getCategory(params.categoryId) : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {cat && (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: cat.color }}
          />
        )}
        <span className="font-medium">{params.summary}</span>
      </div>
      <div className="font-mono text-[10px] text-[var(--muted)]">
        {params.kind === "timed"
          ? `${params.start} → ${params.end}`
          : params.kind === "project"
            ? `${params.start} ~ ${params.end} (프로젝트)`
            : `${params.start} (종일)`}
        {cat && <span> · {cat.label}</span>}
        {typeof params.reminderMinutes === "number" && (
          <span> · 🔔 {params.reminderMinutes}분 전</span>
        )}
      </div>
      {params.description && (
        <p className="mt-1 text-[var(--muted)]">{params.description}</p>
      )}
    </div>
  );
}

function CreatePlanBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "create_plan" }>["params"];
}) {
  const cat = params.categoryId ? getCategory(params.categoryId) : null;
  const periodLabel =
    params.period === "weekly"
      ? "주간"
      : params.period === "monthly"
        ? "월간"
        : "연간";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {cat && (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: cat.color }}
          />
        )}
        <span className="font-medium">{params.title}</span>
      </div>
      <div className="font-mono text-[10px] text-[var(--muted)]">
        {periodLabel} · {params.periodKey}
        {cat && <span> · {cat.label}</span>}
      </div>
      {params.items && params.items.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[var(--muted)]">
          {params.items.slice(0, 8).map((it, i) => (
            <li key={i}>· {it.text}</li>
          ))}
          {params.items.length > 8 && (
            <li className="text-[10px]">+{params.items.length - 8} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function UpdatePlanBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "update_plan" }>["params"];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-[var(--muted)]">
        plan id: {params.planId}
      </span>
      <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] text-[var(--muted)]">
        {JSON.stringify(params.patch, null, 2)}
      </pre>
    </div>
  );
}

function SuggestCommandBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "suggest_command" }>["params"];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[var(--muted)]">{params.explanation}</p>
      <pre className="overflow-x-auto rounded bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-emerald-200">
        {params.cwd ? <span className="text-[var(--muted)]"># cwd: {params.cwd}{"\n"}</span> : null}
        {params.cmd}
      </pre>
      {params.pluginId && (
        <span className="font-mono text-[10px] text-[var(--muted)]">
          related to plugin: {params.pluginId}
        </span>
      )}
      <p className="text-[10px] text-[var(--muted)]">
        ⓘ 서버에서 실행되지 않는다. 복사해서 직접 터미널에 붙여 넣어 실행해라.
      </p>
    </div>
  );
}

function SuggestCommandActions({
  cmd,
  busy,
  onDone,
  onReject,
}: {
  cmd: string;
  busy: boolean;
  onDone: () => void;
  onReject: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select-and-copy via a textarea
      const ta = document.createElement("textarea");
      ta.value = cmd;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // give up — leave the cmd visible for manual copy
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="rounded-md px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
      >
        무시
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={busy}
        className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
      >
        {copied ? "복사됨 ✓" : "복사"}
      </button>
      <button
        type="button"
        onClick={onDone}
        disabled={busy}
        className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
      >
        {busy ? "..." : "실행했음"}
      </button>
    </div>
  );
}

// ── Edit forms ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded border border-[var(--border)] bg-black/30 px-2 py-1.5 text-xs focus:border-[var(--accent)]/50 focus:outline-none";
const selectCls =
  "w-full rounded border border-[var(--border)] bg-[#0b0b0f] px-2 py-1.5 text-xs focus:border-[var(--accent)]/50 focus:outline-none";
const labelCls = "text-[10px] text-[var(--muted)]";

function EditActions({
  busy,
  onCancel,
  onApprove,
}: {
  busy: boolean;
  onCancel: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2 border-t border-[var(--border)] pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-md px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
      >
        취소
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-black disabled:opacity-40"
      >
        {busy ? "..." : "저장 후 승인"}
      </button>
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="">카테고리 없음</option>
      {CATEGORIES.map((c: Category) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function AddEventEdit({
  params,
  busy,
  onApprove,
  onCancel,
}: {
  params: Extract<ProposedAction, { type: "add_event" }>["params"];
  busy: boolean;
  onApprove: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [summary, setSummary] = useState(params.summary);
  const [kind, setKind] = useState<"timed" | "allday" | "project">(params.kind);
  const [start, setStart] = useState(params.start);
  const [end, setEnd] = useState(params.end);
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? "");
  const [reminderMinutes, setReminderMinutes] = useState(
    params.reminderMinutes != null ? String(params.reminderMinutes) : "",
  );
  const [description, setDescription] = useState(params.description ?? "");

  const submit = () => {
    onApprove({
      summary,
      kind,
      start,
      end,
      categoryId: (categoryId || undefined) as CategoryId | undefined,
      reminderMinutes: reminderMinutes !== "" ? parseInt(reminderMinutes, 10) : null,
      description: description || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>제목</span>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>종류</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={selectCls}
        >
          <option value="timed">시간 지정</option>
          <option value="allday">종일</option>
          <option value="project">프로젝트</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className={labelCls}>시작</span>
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="YYYY-MM-DD..." className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelCls}>종료</span>
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="YYYY-MM-DD..." className={inputCls} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>카테고리</span>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>알림 (분 전)</span>
        <input
          type="number"
          value={reminderMinutes}
          onChange={(e) => setReminderMinutes(e.target.value)}
          placeholder="예: 10"
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>설명 (선택)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>
      <EditActions busy={busy} onCancel={onCancel} onApprove={submit} />
    </div>
  );
}

function CreatePlanEdit({
  params,
  busy,
  onApprove,
  onCancel,
}: {
  params: Extract<ProposedAction, { type: "create_plan" }>["params"];
  busy: boolean;
  onApprove: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(params.title);
  const [period, setPeriod] = useState<PlanPeriod>(params.period);
  const [periodKey, setPeriodKey] = useState(params.periodKey);
  const [categoryId, setCategoryId] = useState<string>(params.categoryId ?? "");
  const [itemsText, setItemsText] = useState(
    (params.items ?? []).map((it) => it.text).join("\n"),
  );
  const [notes, setNotes] = useState(params.notes ?? "");

  const submit = () => {
    const items = itemsText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ text: t }));
    onApprove({
      title,
      period,
      periodKey,
      categoryId: (categoryId || null) as CategoryId | null,
      items: items.length > 0 ? items : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>제목</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className={labelCls}>기간</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PlanPeriod)}
            className={selectCls}
          >
            <option value="weekly">주간</option>
            <option value="monthly">월간</option>
            <option value="yearly">연간</option>
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className={labelCls}>키 (예: 2026-W17)</span>
          <input value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>카테고리</span>
        <CategorySelect value={categoryId} onChange={setCategoryId} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>항목 (한 줄에 하나)</span>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={4}
          className={`${inputCls} resize-none`}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>메모 (선택)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>
      <EditActions busy={busy} onCancel={onCancel} onApprove={submit} />
    </div>
  );
}

function UpdatePlanEdit({
  params,
  busy,
  onApprove,
  onCancel,
}: {
  params: Extract<ProposedAction, { type: "update_plan" }>["params"];
  busy: boolean;
  onApprove: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [planId, setPlanId] = useState(params.planId);
  const [patchText, setPatchText] = useState(
    JSON.stringify(params.patch, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const submit = () => {
    let patch: UpdatePlanInput;
    try {
      patch = JSON.parse(patchText) as UpdatePlanInput;
      setJsonError(null);
    } catch {
      setJsonError("JSON 형식 오류");
      return;
    }
    onApprove({ planId, patch });
  };

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>Plan ID</span>
        <input value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputCls} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}>변경 내용 (JSON)</span>
        <textarea
          value={patchText}
          onChange={(e) => {
            setPatchText(e.target.value);
            setJsonError(null);
          }}
          rows={6}
          className={`${inputCls} resize-none font-mono`}
          spellCheck={false}
        />
        {jsonError && (
          <span className="text-[10px] text-amber-300">{jsonError}</span>
        )}
      </div>
      <EditActions busy={busy} onCancel={onCancel} onApprove={submit} />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function WorkspaceActionBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "manage_workspace" }> ["params"];
}) {
  const summary = (() => {
    switch (params.operation) {
      case "add_todo":
        return `Add task: ${params.text}`;
      case "update_todo":
        return `Update task ${params.id}`;
      case "remove_todo":
        return `Remove task ${params.id}`;
      case "add_subscription":
        return `Add subscription: ${params.name} (${params.amount.toLocaleString()} KRW)`;
      case "remove_subscription":
        return `Remove subscription ${params.id}`;
      case "add_watch_item":
        return `Add watch item: ${params.name} (${params.ticker})`;
      case "remove_watch_item":
        return `Remove watch item ${params.id}`;
      case "sync_vault":
        return "Run Obsidian VaultSync now";
      case "create_vault_backup":
        return "Create an Obsidian vault backup";
    }
  })();
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{summary}</p>
      <p className="text-[10px] text-[var(--muted)]">Approval is required before this is applied.</p>
    </div>
  );
}

const URL_PARTS = /(https?:\/\/[^\s<>"]+)/g;

function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PARTS).map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return <Fragment key={index}>{part}</Fragment>;
        const url = part.replace(/[),.;!?]+$/, "");
        const trailing = part.slice(url.length);
        return (
          <Fragment key={index}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--accent)] underline underline-offset-2 hover:opacity-80"
            >
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}

function labelForType(type: ProposedAction["type"]): string {
  switch (type) {
    case "add_event":
      return "+ 일정 추가";
    case "create_plan":
      return "+ 계획 생성";
    case "update_plan":
      return "✎ 계획 수정";
    case "suggest_command":
      return "⌘ 명령어 제안";
    case "create_routine":
      return "+ 루틴 추가";
    case "manage_workspace":
      return "JARVIS workspace control";
  }
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function CreateRoutineBody({
  params,
}: {
  params: Extract<ProposedAction, { type: "create_routine" }>["params"];
}) {
  const days = params.weekdays?.length
    ? params.weekdays.map((d) => WEEKDAY_LABELS[d]).join("/")
    : "매일";
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{params.name}</p>
      <p className="text-[var(--muted)]">반복: {days}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ProposedAction["status"] }) {
  const map = {
    pending: { label: "대기", color: "var(--muted)" },
    approved: { label: "승인됨", color: "#46d6db" },
    rejected: { label: "거절됨", color: "#9aa0a6" },
    failed: { label: "Failed", color: "#f59e0b" },
  } as const;
  const s = map[status];
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[10px]"
      style={{ color: s.color, background: `${s.color}1a` }}
    >
      {s.label}
    </span>
  );
}
