"use client";

import { useRef, useState } from "react";
import type { UploadedFile } from "@/lib/assistant";
import { fileIcon } from "./AssistantPanel";

export function AssistantFiles({
  files,
  selectedIds,
  blobConfigured,
  onClose,
  onSelect,
  onChanged,
}: {
  files: UploadedFile[];
  selectedIds: Set<string>;
  blobConfigured: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(selected)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/assistant/files", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submitUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setUrlInput("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "url_failed");
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (id: string) => {
    if (!confirm("이 파일을 삭제할까요?")) return;
    const res = await fetch(`/api/assistant/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) await onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0b0b0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <h2 className="text-sm font-medium">📎 파일 / 링크</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-foreground"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4">
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.pdf,.docx,image/*"
              onChange={(e) => void upload(e.target.files)}
              className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-black hover:file:bg-[var(--accent)]/90"
            />
            {!blobConfigured && (
              <p className="text-[10px] text-amber-300/80">
                ⚠ BLOB_READ_WRITE_TOKEN 미설정 — 이미지 업로드는 동작 안 할 수
                있어요. 텍스트는 OK.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitUrl();
                }
              }}
              placeholder="https://..."
              className="flex-1 rounded-md border border-[var(--border)] bg-black/30 px-3 py-1.5 text-xs focus:border-[var(--accent)]/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void submitUrl()}
              disabled={uploading || !urlInput.trim()}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
            >
              + URL
            </button>
          </div>

          {uploading && (
            <p className="text-[10px] text-[var(--muted)]">처리 중...</p>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {files.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--muted)]">
              아직 업로드된 파일이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {files.map((f) => {
                const selected = selectedIds.has(f.id);
                return (
                  <li
                    key={f.id}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition ${
                      selected
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(f.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span>{fileIcon(f.kind)}</span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="font-mono text-[10px] text-[var(--muted)]">
                        {formatBytes(f.bytes)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFile(f.id)}
                      className="text-[var(--muted)] hover:text-rose-300"
                      aria-label="삭제"
                      title="삭제"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[10px] text-[var(--muted)]">
          파일을 클릭해서 다음 메시지에 첨부할 수 있어요.
        </footer>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
