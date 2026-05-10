"use client";

import { useRef, useState } from "react";
import type { ParsedEvent } from "@/lib/gemini";

type Step = "input" | "instruct" | "loading" | "preview" | "cal-select" | "importing" | "done";
type UserCalendar = { id: string; summary: string; backgroundColor?: string; primary?: boolean };
type ImportResult = { succeeded: number; failed: number; errors: string[]; calendarName?: string };

export function CsvImport({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [instructMsg, setInstructMsg] = useState("");
  const [allEvents, setAllEvents] = useState<ParsedEvent[]>([]);
  const [correctionMsg, setCorrectionMsg] = useState("");
  const [isReParsing, setIsReParsing] = useState(false);
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [selectedCalId, setSelectedCalId] = useState<string>("primary");
  const [newCalMode, setNewCalMode] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("input");
    setFile(null);
    setSheetUrl("");
    setInstructMsg("");
    setAllEvents([]);
    setCorrectionMsg("");
    setIsReParsing(false);
    setCalendars([]);
    setSelectedCalId("primary");
    setNewCalMode(false);
    setNewCalName("");
    setResult(null);
    setError("");
  }

  async function parseAndPreview(f: File, correction?: string) {
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (correction?.trim()) fd.append("correction", correction.trim());
      const res = await fetch("/api/calendar/import/preview", { method: "POST", body: fd });
      const data = (await res.json()) as { events?: ParsedEvent[]; error?: string };
      if (!res.ok || !data.events?.length) {
        throw new Error(data.error ?? "AI가 일정을 인식하지 못했습니다. 형식을 확인해주세요.");
      }
      return data.events;
    } catch (e) {
      throw e instanceof Error ? e : new Error("파싱 오류");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setInstructMsg("");
    setError("");
    setStep("instruct");
  }

  async function handleSheetLoad() {
    if (!sheetUrl.trim()) return;
    setStep("loading");
    setLoadingMsg("구글 시트 불러오는 중...");
    setError("");
    setFile(null);
    try {
      const csvUrl = toSheetCsvUrl(sheetUrl.trim());
      if (!csvUrl) throw new Error("올바른 구글 시트 URL이 아닙니다.");
      const res = await fetch(`/api/calendar/import/sheet?url=${encodeURIComponent(csvUrl)}`);
      if (!res.ok) throw new Error(await res.text());
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv" });
      const f = new File([blob], "sheet.csv", { type: "text/csv" });
      setFile(f);
      setInstructMsg("");
      setStep("instruct");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
      setStep("input");
    }
  }

  async function handleInstructConfirm() {
    if (!file) return;
    setStep("loading");
    setLoadingMsg("AI가 일정 인식 중...");
    setError("");
    try {
      const instruction = instructMsg.trim();
      if (!instruction) {
        // 지시문 없으면 표준 CSV 먼저 시도
        const rawText = await file.text();
        const { parseCsv } = await import("@/lib/csv");
        const standard = parseCsv(rawText);
        if (standard.length > 0) {
          setAllEvents(standard as ParsedEvent[]);
          setStep("preview");
          return;
        }
      }
      const events = await parseAndPreview(file, instruction || undefined);
      setAllEvents(events);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
      setStep("instruct");
    }
  }

  async function handleReparse() {
    if (!file || !correctionMsg.trim()) return;
    setIsReParsing(true);
    setError("");
    try {
      const events = await parseAndPreview(file, correctionMsg);
      setAllEvents(events);
      setCorrectionMsg("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "재인식 실패");
    } finally {
      setIsReParsing(false);
    }
  }

  async function handleConfirmPreview() {
    setStep("loading");
    setLoadingMsg("캘린더 목록 불러오는 중...");
    try {
      const res = await fetch("/api/google/calendars");
      const data = res.ok ? (await res.json() as { calendars: UserCalendar[] }) : null;
      const cals = data?.calendars ?? [];
      setCalendars(cals);
      const primary = cals.find((c) => c.primary);
      if (primary) setSelectedCalId(primary.id);
      setStep("cal-select");
    } catch {
      setCalendars([]);
      setStep("cal-select");
    }
  }

  async function handleImport() {
    if (!file) return;
    setStep("importing");
    setLoadingMsg("캘린더에 등록 중...");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      // 미리보기 결과를 그대로 전달해 재파싱 방지
      formData.append("events", JSON.stringify(allEvents));
      if (newCalMode && newCalName.trim()) {
        formData.append("projectName", newCalName.trim());
      } else if (selectedCalId && selectedCalId !== "primary") {
        formData.append("calendarId", selectedCalId);
      }
      const res = await fetch("/api/calendar/import", { method: "POST", body: formData });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "임포트 실패");
      setResult(data);
      setStep("done");
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생");
      setStep("cal-select");
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
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[#101015] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">일정 임포트</h2>
          <button
            onClick={() => { setOpen(false); reset(); }}
            className="text-xs text-[var(--muted)] hover:text-foreground"
          >
            ✕ 닫기
          </button>
        </div>

        {/* ── Step: input ── */}
        {step === "input" && (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs text-[var(--muted)]">구글 시트 URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSheetLoad();
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
                />
                <button
                  onClick={handleSheetLoad}
                  disabled={!sheetUrl.trim()}
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

            <div
              className="mb-4 cursor-pointer rounded-lg border border-dashed border-[var(--border)] p-5 text-center transition hover:border-[var(--accent)]/50"
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-[var(--muted)]">CSV 파일 선택 (클릭 또는 드래그)</p>
            </div>

            <details className="mb-4">
              <summary className="cursor-pointer text-[10px] text-[var(--muted)] hover:text-foreground">
                ▶ CSV 형식 보기
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] text-[var(--muted)]">
{`제목,날짜,시작시간,종료시간,카테고리,장소
팀 회의,2026-05-10,10:00,11:00,회사,회의실 A
헬스,2026-05-10,07:00,,인생,
기획서 마감,2026-05-15,,,앱개발,`}
              </pre>
            </details>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </>
        )}

        {/* ── Step: instruct ── */}
        {step === "instruct" && file && (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2.5">
              <span className="text-sm text-[var(--accent)]">↑</span>
              <span className="flex-1 truncate text-xs text-foreground">{file.name}</span>
              <span className="shrink-0 text-[10px] text-[var(--muted)]">불러옴</span>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                이 시트에서 어떤 일정을 가져올까요?
              </label>
              <textarea
                value={instructMsg}
                onChange={(e) => setInstructMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleInstructConfirm();
                }}
                rows={3}
                autoFocus
                placeholder={"예: VFX 관련 일정만 가져와줘\n예: 수요일이 20일이야, 날짜 기준으로 인식해줘\n예: 4월 일정만 / 전체 다 가져와도 돼"}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)]/60 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                비워두면 AI가 자동으로 전체 인식합니다. 힌트를 주면 더 정확해집니다.
              </p>
            </div>

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep("input"); setFile(null); setError(""); }}
                className="text-xs text-[var(--muted)] hover:text-foreground"
              >
                ← 다시 선택
              </button>
              <button
                onClick={handleInstructConfirm}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                확인 →
              </button>
            </div>
          </>
        )}

        {/* ── Step: loading / importing ── */}
        {(step === "loading" || step === "importing") && (
          <div className="flex flex-col items-center gap-4 py-10">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <p className="text-sm text-[var(--muted)]">{loadingMsg}</p>
          </div>
        )}

        {/* ── Step: preview ── */}
        {step === "preview" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[var(--accent)]">✦</span>
              <p className="text-sm font-medium">
                총 <strong>{allEvents.length}개</strong> 일정을 인식했습니다
              </p>
            </div>

            <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
              {allEvents.map((ev, i) => (
                <div
                  key={i}
                  className={`flex gap-3 px-3 py-2 text-[11px] ${i !== 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <span className="flex-1 truncate font-medium">{ev.summary}</span>
                  <span className="shrink-0 text-[var(--muted)]">{ev.date}</span>
                  {ev.startTime && (
                    <span className="shrink-0 text-[var(--muted)]">{ev.startTime}</span>
                  )}
                </div>
              ))}
            </div>

            {/* 수정 요청 */}
            <div className="mb-4">
              <label className="mb-1.5 block text-[11px] text-[var(--muted)]">
                잘못 인식된 내용이 있으면 알려주세요
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={correctionMsg}
                  onChange={(e) => setCorrectionMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && correctionMsg.trim() && handleReparse()}
                  placeholder="예: 본편 릴리즈는 5월 20일입니다"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60 focus:outline-none"
                />
                <button
                  onClick={handleReparse}
                  disabled={!correctionMsg.trim() || isReParsing}
                  className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-foreground disabled:opacity-40"
                >
                  {isReParsing ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : "재인식"}
                </button>
              </div>
            </div>

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStep("instruct"); setAllEvents([]); }}
                className="text-xs text-[var(--muted)] hover:text-foreground"
              >
                ← 다시 선택
              </button>
              <button
                onClick={handleConfirmPreview}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                이 {allEvents.length}개 임포트 →
              </button>
            </div>
          </>
        )}

        {/* ── Step: cal-select ── */}
        {step === "cal-select" && (
          <>
            <p className="mb-4 text-sm font-medium">어느 캘린더에 등록할까요?</p>

            {calendars.length > 0 && !newCalMode && (
              <div className="mb-4 flex flex-wrap gap-2">
                {calendars.map((cal) => (
                  <button
                    key={cal.id}
                    type="button"
                    onClick={() => setSelectedCalId(cal.id)}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition"
                    style={{
                      borderColor: selectedCalId === cal.id
                        ? (cal.backgroundColor ?? "var(--accent)")
                        : "var(--border)",
                      background: selectedCalId === cal.id
                        ? `${cal.backgroundColor ?? "var(--accent)"}26`
                        : "transparent",
                      color: selectedCalId === cal.id
                        ? (cal.backgroundColor ?? "var(--accent)")
                        : "var(--muted)",
                    }}
                  >
                    {cal.backgroundColor && (
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: cal.backgroundColor }}
                      />
                    )}
                    {cal.summary}
                    {cal.primary && (
                      <span className="text-[9px] opacity-60">(기본)</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* 새 캘린더 생성 토글 */}
            {!newCalMode ? (
              <button
                type="button"
                onClick={() => setNewCalMode(true)}
                className="mb-4 flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-foreground"
              >
                + 새 캘린더 생성
              </button>
            ) : (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCalName}
                    onChange={(e) => setNewCalName(e.target.value)}
                    autoFocus
                    placeholder="새 캘린더 이름 (예: WeeWoo MV)"
                    maxLength={50}
                    className="flex-1 rounded-lg border border-[var(--accent)]/60 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-[var(--muted)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => { setNewCalMode(false); setNewCalName(""); }}
                    className="text-xs text-[var(--muted)] hover:text-foreground"
                  >
                    취소
                  </button>
                </div>
                {newCalName.trim() && (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    "{newCalName.trim()}" 캘린더가 새로 생성됩니다.
                  </p>
                )}
              </div>
            )}

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep("preview")}
                className="text-xs text-[var(--muted)] hover:text-foreground"
              >
                ← 이전
              </button>
              <button
                onClick={handleImport}
                disabled={newCalMode && !newCalName.trim()}
                className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40"
              >
                임포트
              </button>
            </div>
          </>
        )}

        {/* ── Step: done ── */}
        {step === "done" && result && (
          <div className="text-center">
            <p className="text-3xl">✓</p>
            <p className="mt-3 text-base font-semibold">임포트 완료</p>
            {result.calendarName && (
              <p className="mt-1 text-xs text-[var(--accent)]">
                "{result.calendarName}" 캘린더에 등록됨
              </p>
            )}
            <p className="mt-1 text-sm text-[var(--muted)]">
              {result.succeeded}개 성공
              {result.failed > 0 ? ` · ${result.failed}개 실패` : ""}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 text-left text-xs text-red-400">
                {result.errors.map((e, i) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
            )}
            <button
              onClick={() => { setOpen(false); reset(); }}
              className="mt-5 rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-black"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function toSheetCsvUrl(rawUrl: string): string | null {
  // iOS Safari pasting often introduces invisible characters (U+200B-200D, U+FEFF)
  // and smart-quote substitutions. Strip them before parsing.
  const url = rawUrl
    .replace(/[​-‍﻿ ]/g, "")
    .trim();

  // "publish to web" URL: /spreadsheets/d/e/{ID}/pubhtml
  const pubMatch = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch) {
    const id = pubMatch[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    return gid
      ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv&gid=${gid}`
      : `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv`;
  }

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const id = match[1];
  const gidMatch = url.match(/gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
