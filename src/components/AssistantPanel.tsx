"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, UploadedFile } from "@/lib/assistant";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantFiles } from "./AssistantFiles";

type Status = {
  storage: boolean;
  ai: boolean;
  blob: boolean;
};

type GoogleStatus =
  | { configured: false; connected: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email?: string };

export function AssistantPanel({
  onClose,
  prefillText,
  onPrefillConsumed,
}: {
  onClose: () => void;
  prefillText?: string;
  onPrefillConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Apply prefill from external trigger (e.g., "비서에게 묻기" buttons).
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
      onPrefillConsumed?.();
    }
  }, [prefillText, onPrefillConsumed]);

  const refreshAll = async () => {
    const [hRes, fRes] = await Promise.all([
      fetch("/api/assistant/history"),
      fetch("/api/assistant/files"),
    ]);
    if (hRes.ok) {
      const data = (await hRes.json()) as { messages: ChatMessage[] };
      setMessages(data.messages);
    }
    if (fRes.ok) {
      const data = (await fRes.json()) as { files: UploadedFile[] };
      setFiles(data.files);
    }
  };

  // Initial load: status + history + files
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/assistant/status").then((r) => r.json() as Promise<Status>),
      fetch("/api/google/status").then((r) => r.json() as Promise<GoogleStatus>),
    ])
      .then(([s, gs]) => {
        if (cancelled) return;
        setStatus(s);
        setGoogleStatus(gs);
        if (s.storage && gs.configured && gs.connected) {
          void refreshAll();
        }
      })
      .catch(() => {
        if (!cancelled) setError("상태 확인 실패");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll on new messages
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lastMessageId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setText("");

    const tempUserId = `temp-u-${Date.now()}`;
    const tempAiId = `temp-a-${Date.now()}`;

    // 낙관적 업데이트: 사용자 메시지 + 빈 AI 말풍선 즉시 표시
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: "user", text: trimmed, ts: Date.now() } as ChatMessage,
      { id: tempAiId, role: "assistant", text: "", ts: Date.now() } as ChatMessage,
    ]);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          attachmentFileIds: Array.from(selectedFileIds),
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "chat_failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let streamText = "";

      const updateAi = (t: string) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAiId ? { ...m, text: t } : m)),
        );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          const eventType = eventLine ? eventLine.slice(7).trim() : "token";
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (eventType === "token") {
            streamText += data.text as string;
            updateAi(streamText);
          } else if (eventType === "reset") {
            streamText = "";
            updateAi("");
          } else if (eventType === "status") {
            updateAi(data.message as string);
          } else if (eventType === "done") {
            const final = data as { messages: ChatMessage[] };
            setMessages(final.messages);
          } else if (eventType === "error") {
            throw new Error((data.error as string) ?? "chat_failed");
          }
        }
      }

      setSelectedFileIds(new Set());
    } catch (e) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempUserId && m.id !== tempAiId),
      );
      setError(e instanceof Error ? e.message : "chat_failed");
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (
    messageId: string,
    actionId: string,
    decision: "approve" | "reject",
    params?: Record<string, unknown>,
  ) => {
    const res = await fetch("/api/assistant/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, actionId, decision, params }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "action_failed");
      return;
    }
    await refreshAll();
  };

  const clearHistory = async () => {
    if (!confirm("대화 기록을 모두 지울까요?")) return;
    await fetch("/api/assistant/history", { method: "DELETE" });
    setMessages([]);
  };

  const fileById = useMemo(() => {
    const m = new Map<string, UploadedFile>();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);

  // Render states
  if (!status || !googleStatus) {
    return <Frame onClose={onClose} title="비서">
      <div className="p-6 text-center text-xs text-[var(--muted)]">
        상태 확인 중...
      </div>
    </Frame>;
  }

  if (!googleStatus.configured) {
    return (
      <Frame onClose={onClose} title="비서">
        <div className="p-6 text-xs text-amber-300/90">
          Google OAuth 환경변수가 설정되지 않았습니다.
        </div>
      </Frame>
    );
  }
  if (!googleStatus.connected) {
    return (
      <Frame onClose={onClose} title="비서">
        <div className="flex flex-col gap-3 p-6 text-sm">
          <p className="text-[var(--muted)]">
            비서를 쓰려면 먼저 Google 계정을 연결해주세요.
          </p>
          <a
            href="/api/google/auth"
            className="inline-flex w-fit rounded-md bg-white px-4 py-2 text-xs font-medium text-black"
          >
            Google 연결
          </a>
        </div>
      </Frame>
    );
  }
  if (!status.storage) {
    return (
      <Frame onClose={onClose} title="비서">
        <div className="p-6 text-xs text-amber-300/90">
          저장소(Upstash Redis)가 연결돼있지 않습니다.
        </div>
      </Frame>
    );
  }
  if (!status.ai) {
    return (
      <Frame onClose={onClose} title="비서">
        <div className="p-6 text-xs text-amber-300/90">
          GEMINI_API_KEY 환경변수가 없습니다.
        </div>
      </Frame>
    );
  }

  return (
    <Frame
      onClose={onClose}
      title="뇌 대리"
      subtitle={googleStatus.email}
      actions={
        <>
          <button
            type="button"
            onClick={() => setFilesOpen(true)}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="파일"
            title="파일"
          >
            📎
          </button>
          <button
            type="button"
            onClick={clearHistory}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="기록 초기화"
            title="기록 초기화"
          >
            ⟲
          </button>
        </>
      }
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-[var(--muted)]">
            <p>안녕. 캘린더, 계획, 업로드한 파일을 다 보고 답할게.</p>
            <p>예: &quot;오늘 뭐 해야 돼?&quot;, &quot;이번 주 인생 영역에 뭐 비어있어?&quot;</p>
          </div>
        )}
        {messages.map((m) => (
          <AssistantMessage
            key={m.id}
            message={m}
            fileById={fileById}
            onAction={handleAction}
          />
        ))}
        {sending && messages[messages.length - 1]?.text === "" && (
          <div className="my-1 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            생각하는 중...
          </div>
        )}
      </div>

      {selectedFileIds.size > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] bg-white/[0.02] px-3 py-2">
          {Array.from(selectedFileIds).map((id) => {
            const f = fileById.get(id);
            if (!f) return null;
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
              >
                {fileIcon(f.kind)} {f.name}
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedFileIds);
                    next.delete(id);
                    setSelectedFileIds(next);
                  }}
                  className="hover:text-rose-300"
                  aria-label="제거"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {error && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--card)] p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="물어봐..."
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm focus:border-[var(--accent)]/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !text.trim()}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-black disabled:opacity-40"
        >
          전송
        </button>
      </div>

      {filesOpen && (
        <AssistantFiles
          files={files}
          selectedIds={selectedFileIds}
          blobConfigured={status.blob}
          onClose={() => setFilesOpen(false)}
          onSelect={(id) => {
            const next = new Set(selectedFileIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelectedFileIds(next);
          }}
          onChanged={refreshAll}
        />
      )}
    </Frame>
  );
}

function Frame({
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{title}</span>
          {subtitle && (
            <span className="truncate font-mono text-[10px] text-[var(--muted)]">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/5 hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      </header>
      {children}
    </>
  );
}

export function fileIcon(kind: UploadedFile["kind"]): string {
  switch (kind) {
    case "image":
      return "🖼";
    case "pdf":
      return "📕";
    case "docx":
      return "📄";
    case "json":
      return "📦";
    case "url":
      return "🔗";
    case "markdown":
      return "📝";
    default:
      return "📃";
  }
}
