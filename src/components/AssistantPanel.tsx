"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, UploadedFile } from "@/lib/assistant";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantFiles } from "./AssistantFiles";
import { toSpeakable, useVoiceChat } from "./useVoiceChat";

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

  /** Sends a message; returns the text worth reading aloud for voice mode. */
  const send = async (override?: string): Promise<string | null> => {
    const trimmed = (override ?? text).trim();
    if (!trimmed || sending) return null;
    setSending(true);
    setError(null);
    if (override === undefined) setText("");
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          attachmentFileIds: Array.from(selectedFileIds),
        }),
      });
      const data = (await res.json()) as
        | { messages: ChatMessage[] }
        | { error: string };
      if (!res.ok || !("messages" in data)) {
        throw new Error(("error" in data && data.error) || "chat_failed");
      }
      setMessages(data.messages);
      setSelectedFileIds(new Set());
      const last = data.messages[data.messages.length - 1];
      if (last?.role !== "assistant") return null;
      const spoken = toSpeakable(last.text);
      const pending = last.proposedActions?.some((a) => a.status === "pending");
      return pending ? `${spoken} 승인이 필요한 항목이 화면에 있어요.` : spoken;
    } catch (e) {
      setError(e instanceof Error ? e.message : "chat_failed");
      return null;
    } finally {
      setSending(false);
    }
  };

  const voice = useVoiceChat(send);

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
        {sending && (
          <div className="my-3 flex items-center gap-2 text-xs text-[var(--muted)]">
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

      {voice.state !== "off" && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2 text-xs">
          <span className="truncate text-foreground">
            {voice.state === "listening" && (voice.interim || "듣고 있어요, 말씀하세요")}
            {voice.state === "thinking" && "생각 중"}
            {voice.state === "speaking" &&
              (!voice.bargeLive
                ? voice.bargeIn
                  ? "말하는 중 (끼어들기는 다음 답변부터)"
                  : "말하는 중"
                : voice.interim
                  ? `🎤 ${voice.interim}`
                  : "말하는 중 · 🎤 듣는 중 (\"중단\"이라고 말하면 멈춰요)")}
            <span aria-hidden className="ml-0.5 inline-flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="animate-pulse" style={{ animationDelay: `${i * 250}ms` }}>
                  .
                </span>
              ))}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => voice.setBargeIn(!voice.bargeIn)}
              aria-pressed={voice.bargeIn}
              title="말하는 중에도 듣기. 노트북 스피커에서는 어시스턴트 소리를 잘못 알아듣기 쉬우니 이어폰을 쓸 때만 켜세요."
              className={`rounded-md border px-2 py-1 ${
                voice.bargeIn
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-white/5"
              }`}
            >
              🎧 끼어들기 {voice.bargeIn ? "켬" : "끔"}
            </button>
            <button
              type="button"
              onClick={voice.stop}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:bg-white/5"
            >
              대화 종료
            </button>
          </div>
        </div>
      )}
      {voice.error && (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
          {voice.error}
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
        {voice.supported && (
          <button
            type="button"
            onClick={voice.state === "off" ? voice.start : voice.stop}
            aria-label={voice.state === "off" ? "음성 대화 시작" : "음성 대화 종료"}
            title="음성 대화"
            className={`rounded-md border px-3 py-2 text-xs ${
              voice.state === "off"
                ? "border-[var(--border)] text-[var(--muted)] hover:bg-white/5"
                : "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
            }`}
          >
            🎤
          </button>
        )}
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
