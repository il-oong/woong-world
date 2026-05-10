"use client";

import { askAssistant } from "./AssistantWidget";

export function AskAssistantButton({
  prompt,
  label = "비서에게 묻기",
  className,
}: {
  prompt: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => askAssistant(prompt)}
      className={
        className ??
        "rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-foreground"
      }
      title="비서에게 이 항목에 대해 묻기"
    >
      {label}
    </button>
  );
}
