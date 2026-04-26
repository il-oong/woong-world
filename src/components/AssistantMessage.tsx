"use client";

import { useState } from "react";
import { CATEGORIES, getCategory } from "@/lib/categories";
import type {
  ChatMessage,
  ProposedAction,
  UploadedFile,
} from "@/lib/assistant";
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
        {message.text}
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
            onAction={(decision) =>
              onAction(message.id, action.id, decision)
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
  onAction: (decision: "approve" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await onAction(decision);
    } finally {
      setBusy(false);
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
      </div>

      {action.status === "pending" && (
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
          <button
            type="button"
            onClick={() => void decide("reject")}
            disabled={busy}
            className="rounded-md px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5 hover:text-foreground disabled:opacity-40"
          >
            거절
          </button>
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
    </div>
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
  }
}

function StatusBadge({ status }: { status: ProposedAction["status"] }) {
  const map = {
    pending: { label: "대기", color: "var(--muted)" },
    approved: { label: "승인됨", color: "#46d6db" },
    rejected: { label: "거절됨", color: "#9aa0a6" },
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

// suppress lint warning about unused imports if any
void CATEGORIES;
