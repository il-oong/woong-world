"use client";

import { useRef, useState } from "react";
import type { CsvRow } from "@/lib/csv";

type ImportResult = { succeeded: number; failed: number; errors: string[] };

export function CsvImport({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CsvRow[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setFile(null);
    setSheetUrl("");
    setResult(null);
    setError("");
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    setResult(null);
    const text = await f.text();
    const { parseCsv } = await import("@/lib/csv");
    setPreview(parseCsv(text).slice(0, 5));
  }

  async function handleSheetLoad() {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      // Google Sheets CSV export URL 변환
      const csvUrl = toSheetCsvUrl(sheetUrl.trim());
      if (!csvUrl) throw new Error("올바른 구글 시트 URL이 아닙니다.");
      const res = await fetch(`/api/calendar/import/sheet?url=${encodeURIComponent(csvUrl)}`);
      if (!res.ok) throw new Error("시트를 불러오지 못했습니다.");
      const text = await res.text();
      const { parseCsv } = await import("@/lib/csv");
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("유효한 행이 없습니다. 헤더 형식을 확인해주세요.");
      // blob으로 파일화
      const blob = new Blob([text], { type: "text/csv" });
      setFile(new File([blob], "sheet.csv", { type: "text/csv" }));
      setPreview(rows.slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/calendar/import", { method: "POST", body: formData });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "임포트 실패");
      setResult(data);
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground"
      >
        ↑ CSV / 시트 임포트
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[#101015] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">일정 임포트</h2>
          <button onClick={() => { setOpen(false); reset(); }} className="text-xs text-[var(--muted)] hover:text-foreground">✕ 닫기</button>
        </div>

        {!result ? (
          <>
            {/* Google Sheets URL */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-[var(--muted)]">구글 시트 URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
                />
                <button
                  onClick={handleSheetLoad}
                  disabled={loading || !sheetUrl.trim()}
                  className="rounded-lg bg-[var(--accent)]/20 px-3 py-2 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)]/30 disabled:opacity-40"
                >
                  불러오기
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                시트는 반드시 <strong>공개(링크가 있는 모든 사용자)</strong>로 설정되어 있어야 합니다.
              </p>
            </div>

            <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
              <div className="h-px flex-1 bg-[var(--border)]" />
              또는
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {/* CSV 파일 업로드 */}
            <div
              className="mb-4 cursor-pointer rounded-lg border border-dashed border-[var(--border)] p-4 text-center transition hover:border-[var(--accent)]/50"
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
              <p className="text-xs text-[var(--muted)]">
                {file ? `✓ ${file.name}` : "CSV 파일 선택 (클릭 또는 드래그)"}
              </p>
            </div>

            {/* CSV 형식 안내 */}
            <details className="mb-4">
              <summary className="cursor-pointer text-[10px] text-[var(--muted)] hover:text-foreground">
                CSV 형식 보기
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] text-[var(--muted)]">
{`제목,날짜,시작시간,종료시간,카테고리,장소
팀 회의,2026-05-10,10:00,11:00,회사,회의실 A
헬스,2026-05-10,07:00,,인생,
기획서 마감,2026-05-15,,,앱개발,`}
              </pre>
            </details>

            {/* 미리보기 */}
            {preview && preview.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs text-[var(--muted)]">미리보기 (최대 5행)</p>
                <div className="overflow-hidden rounded-lg border border-[var(--border)] text-[11px]">
                  {preview.map((row, i) => (
                    <div key={i} className={`flex gap-3 px-3 py-2 ${i !== 0 ? "border-t border-[var(--border)]" : ""}`}>
                      <span className="flex-1 truncate font-medium">{row.summary}</span>
                      <span className="text-[var(--muted)]">{row.date}</span>
                      {row.startTime && <span className="text-[var(--muted)]">{row.startTime}</span>}
                      {row.category && <span className="text-[var(--accent)]">{row.category}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "임포트 중..." : "캘린더에 등록"}
            </button>
          </>
        ) : (
          <div className="text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-2 text-base font-semibold">임포트 완료</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {result.succeeded}개 성공{result.failed > 0 ? ` · ${result.failed}개 실패` : ""}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 text-left text-xs text-red-400">
                {result.errors.map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            )}
            <button
              onClick={() => { setOpen(false); reset(); }}
              className="mt-4 rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-black"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function toSheetCsvUrl(url: string): string | null {
  // https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
  // → https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid=0
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const id = match[1];
  const gidMatch = url.match(/gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
