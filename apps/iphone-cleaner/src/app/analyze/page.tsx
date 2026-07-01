"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  getImageDimensions,
  isScreenshotByDimensions,
  isScreenshotByName,
  isImageFile,
  formatBytes,
} from "@/lib/image-utils";

type Phase = "idle" | "loading" | "hashing" | "done" | "error";

interface AnalyzedFile {
  file: File;
  hash: string;
  isScreenshot: boolean;
  thumbUrl: string;
}

interface DuplicateGroup {
  hash: string;
  files: AnalyzedFile[];
}

interface Result {
  duplicateGroups: DuplicateGroup[];
  screenshots: AnalyzedFile[];
  others: AnalyzedFile[];
  totalFiles: number;
  totalSize: number;
  potentialSavings: number;
}

interface FileStatus {
  [key: string]: "keep" | "delete";
}

// Inline Web Worker for SHA-256 hashing — avoids blocking the main thread
const WORKER_CODE = `
self.onmessage = async ({ data: { id, buffer } }) => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  self.postMessage({ id, hex });
};
`;

function createHashWorker(): Worker {
  const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function hashFileWithWorker(worker: Worker, file: File, id: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", handler);
      resolve(e.data.hex);
    };
    worker.addEventListener("message", handler);
    file.arrayBuffer().then((buf) => worker.postMessage({ id, buffer: buf }, [buf])).catch(reject);
  });
}

export default function AnalyzePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [fileStatus, setFileStatus] = useState<FileStatus>({});
  const [activeTab, setActiveTab] = useState<"duplicates" | "screenshots" | "others">("duplicates");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const thumbUrlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke thumbnail object URLs on unmount
  useEffect(() => {
    return () => {
      thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const runAnalysis = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => isImageFile(f.name));
    if (imageFiles.length === 0) {
      setError("선택한 파일 중 이미지가 없습니다. JPG, PNG, HEIC 등의 파일을 선택해 주세요.");
      setPhase("error");
      return;
    }

    setPhase("hashing");
    setProgress({ current: 0, total: imageFiles.length });

    // Revoke old thumbs
    thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    thumbUrlsRef.current = [];

    const worker = createHashWorker();
    const analyzed: AnalyzedFile[] = [];
    const BATCH = 8;

    try {
      for (let i = 0; i < imageFiles.length; i += BATCH) {
        const batch = imageFiles.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (file, bi) => {
            const id = i + bi;
            const [hash, dims] = await Promise.all([
              hashFileWithWorker(worker, file, id),
              getImageDimensions(file).catch(() => null),
            ]);

            const isScreenshot =
              isScreenshotByName(file.name) ||
              (dims ? isScreenshotByDimensions(dims.width, dims.height) : false);

            const thumbUrl = URL.createObjectURL(file);
            thumbUrlsRef.current.push(thumbUrl);

            analyzed.push({ file, hash, isScreenshot, thumbUrl });
          })
        );
        setProgress({ current: Math.min(i + BATCH, imageFiles.length), total: imageFiles.length });
      }
    } finally {
      worker.terminate();
    }

    // Group by hash
    const hashMap = new Map<string, AnalyzedFile[]>();
    for (const a of analyzed) {
      const group = hashMap.get(a.hash) ?? [];
      group.push(a);
      hashMap.set(a.hash, group);
    }

    const duplicateGroups: DuplicateGroup[] = [];
    for (const [hash, group] of hashMap) {
      if (group.length > 1) duplicateGroups.push({ hash, files: group });
    }

    const dupKeys = new Set(duplicateGroups.flatMap((g) => g.files.map((f) => f.file.name + f.hash)));
    const screenshots = analyzed.filter(
      (a) => a.isScreenshot && !dupKeys.has(a.file.name + a.hash)
    );
    const shotKeys = new Set(screenshots.map((a) => a.file.name + a.hash));
    const others = analyzed.filter(
      (a) => !dupKeys.has(a.file.name + a.hash) && !shotKeys.has(a.file.name + a.hash)
    );

    // Default: keep first of each dup group, delete rest
    const initialStatus: FileStatus = {};
    for (const g of duplicateGroups) {
      g.files.forEach((a, idx) => {
        initialStatus[a.hash + a.file.name] = idx === 0 ? "keep" : "delete";
      });
    }

    const totalSize = analyzed.reduce((s, a) => s + a.file.size, 0);
    let potentialSavings = 0;
    for (const g of duplicateGroups) {
      g.files.slice(1).forEach((a) => (potentialSavings += a.file.size));
    }
    screenshots.forEach((a) => (potentialSavings += a.file.size));

    setFileStatus(initialStatus);
    setResult({ duplicateGroups, screenshots, others, totalFiles: imageFiles.length, totalSize, potentialSavings });
    setPhase("done");
    setActiveTab("duplicates");
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      setError("");
      setResult(null);
      setFileStatus({});
      setPhase("loading");
      await runAnalysis(files);
    },
    [runAnalysis]
  );

  const toggleStatus = (key: string) =>
    setFileStatus((prev) => ({ ...prev, [key]: prev[key] === "delete" ? "keep" : "delete" }));

  const copyDeleteList = async () => {
    if (!result) return;
    const names: string[] = [];
    for (const g of result.duplicateGroups) {
      g.files.forEach((a) => {
        if (fileStatus[a.hash + a.file.name] === "delete") names.push(a.file.name);
      });
    }
    result.screenshots.forEach((a) => names.push(a.file.name));
    if (names.length === 0) { alert("삭제할 파일이 없습니다."); return; }
    await navigator.clipboard.writeText(names.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const deleteCount = result
    ? Object.values(fileStatus).filter((s) => s === "delete").length + result.screenshots.length
    : 0;

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); flex-shrink: 0; }
        .file-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
        .file-row + .file-row { border-top: 1px solid var(--border); }
      `}</style>

      <div style={{ marginBottom: "36px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.5px", marginBottom: "8px", color: "var(--text-primary)" }}>
          📷 사진 분석
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          사진첩에서 파일을 선택하면 중복 사진과 스크린샷을 자동으로 찾아드립니다.
          <strong style={{ color: "var(--text-primary)" }}> 파일은 서버로 전송되지 않습니다.</strong>
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        style={{ display: "none" }}
        onChange={handleFileInput}
      />

      {/* Idle / Pick */}
      {phase === "idle" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "2px dashed var(--border)", borderRadius: "20px", padding: "64px 32px", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
          <div style={{ fontSize: "60px", marginBottom: "20px" }}>🖼️</div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px" }}>사진 선택하기</h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "400px", margin: "0 auto 28px" }}>
            아이폰 사진첩에서 전체 선택하거나, PC에 옮긴 사진 폴더에서 선택하세요.
            많을수록 더 많은 중복을 찾습니다.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            style={{ padding: "14px 40px", fontSize: "15px", fontWeight: 700, color: "#fff", backgroundColor: "#6c63ff", border: "none", borderRadius: "12px", cursor: "pointer" }}
          >
            사진 선택
          </button>
          <p style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-secondary)" }}>
            JPG · PNG · HEIC · WEBP · GIF 지원
          </p>
        </div>
      )}

      {/* Loading / Hashing */}
      {(phase === "loading" || phase === "hashing") && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "20px", padding: "56px 32px", textAlign: "center" }}>
          <div style={{ width: "52px", height: "52px", margin: "0 auto 24px", border: "3px solid var(--border)", borderTopColor: "#6c63ff", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
          <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px" }}>
            {phase === "loading" ? "파일 로드 중..." : `분석 중 (${progress.current} / ${progress.total})`}
          </h2>
          {phase === "hashing" && progress.total > 0 && (
            <>
              <div style={{ maxWidth: "360px", margin: "16px auto 0", height: "6px", backgroundColor: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, backgroundColor: "#6c63ff", borderRadius: "3px", transition: "width 0.2s" }} />
              </div>
              <p style={{ marginTop: "10px", fontSize: "13px", color: "var(--text-secondary)" }}>
                SHA-256 해싱으로 완전 일치 중복을 감지합니다
              </p>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "16px", padding: "32px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
          <p style={{ fontSize: "14px", color: "#fca5a5", lineHeight: 1.7, marginBottom: "20px" }}>{error}</p>
          <button onClick={() => setPhase("idle")} style={{ padding: "10px 28px", fontSize: "14px", fontWeight: 600, color: "#fff", backgroundColor: "#6c63ff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
            다시 시도
          </button>
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <div style={{ animation: "fadeIn 0.4s ease" }}>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "28px" }}>
            {[
              { label: "전체 사진", value: `${result.totalFiles}개`, sub: formatBytes(result.totalSize), color: "#6c63ff", icon: "🖼️" },
              { label: "중복 그룹", value: `${result.duplicateGroups.length}개`, sub: `${result.duplicateGroups.reduce((a, g) => a + g.files.length, 0)}개 파일`, color: "#f59e0b", icon: "📋" },
              { label: "스크린샷", value: `${result.screenshots.length}개`, sub: formatBytes(result.screenshots.reduce((a, f) => a + f.file.size, 0)), color: "#3b82f6", icon: "📸" },
              { label: "절약 가능", value: formatBytes(result.potentialSavings), sub: "삭제 시 확보", color: "#22c55e", icon: "💾" },
            ].map((c, i) => (
              <div key={i} style={{ padding: "18px", backgroundColor: "var(--bg-card)", border: `1px solid ${c.color}30`, borderRadius: "12px", borderTop: `3px solid ${c.color}` }}>
                <div style={{ fontSize: "22px", marginBottom: "8px" }}>{c.icon}</div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: c.color, marginBottom: "2px" }}>{c.value}</div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{c.label}</div>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "3px" }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Action bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}>
            <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              삭제 대상: <span style={{ color: "#ef4444", fontWeight: 700 }}>{deleteCount}개</span>
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={copyDeleteList}
                style={{ padding: "9px 20px", fontSize: "13px", fontWeight: 600, color: "#fff", backgroundColor: copied ? "#22c55e" : "#6c63ff", border: "none", borderRadius: "8px", cursor: "pointer", transition: "background-color 0.2s" }}
              >
                {copied ? "✓ 복사됨!" : "삭제 목록 복사"}
              </button>
              <button
                onClick={() => { setPhase("idle"); setResult(null); inputRef.current && (inputRef.current.value = ""); }}
                style={{ padding: "9px 20px", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}
              >
                다시 선택
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "20px" }}>
            {([
              { key: "duplicates" as const, label: `중복 (${result.duplicateGroups.length}그룹)` },
              { key: "screenshots" as const, label: `스크린샷 (${result.screenshots.length}개)` },
              { key: "others" as const, label: `기타 (${result.others.length}개)` },
            ]).map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ padding: "10px 18px", fontSize: "14px", fontWeight: activeTab === t.key ? 700 : 400, color: activeTab === t.key ? "#6c63ff" : "var(--text-secondary)", backgroundColor: "transparent", border: "none", borderBottom: activeTab === t.key ? "2px solid #6c63ff" : "2px solid transparent", cursor: "pointer", marginBottom: "-1px" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Duplicates tab */}
          {activeTab === "duplicates" && (
            result.duplicateGroups.length === 0
              ? <Empty icon="✅" msg="중복 사진이 없습니다!" />
              : result.duplicateGroups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: "16px", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "rgba(245,158,11,0.06)", fontSize: "13px", color: "#f59e0b", fontWeight: 700 }}>
                    중복 그룹 #{gi + 1} · {g.files.length}개 파일 · {formatBytes(g.files[0].file.size)} 각
                  </div>
                  {g.files.map((a, fi) => {
                    const key = a.hash + a.file.name;
                    const status = fileStatus[key] ?? "keep";
                    return (
                      <div key={fi} className="file-row" style={{ backgroundColor: status === "delete" ? "rgba(239,68,68,0.04)" : "transparent" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="thumb" src={a.thumbUrl} alt={a.file.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: status === "delete" ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: status === "delete" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file.name}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                            {formatBytes(a.file.size)}
                            {fi === 0 && <span style={{ marginLeft: "8px", color: "#22c55e", fontWeight: 600 }}>원본 유지</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleStatus(key)}
                          style={{ padding: "5px 13px", fontSize: "12px", fontWeight: 600, flexShrink: 0, color: status === "delete" ? "#ef4444" : "var(--text-secondary)", backgroundColor: status === "delete" ? "rgba(239,68,68,0.1)" : "var(--bg-secondary)", border: `1px solid ${status === "delete" ? "rgba(239,68,68,0.3)" : "var(--border)"}`, borderRadius: "6px", cursor: "pointer" }}
                        >
                          {status === "delete" ? "삭제 예정" : "유지"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
          )}

          {/* Screenshots tab */}
          {activeTab === "screenshots" && (
            result.screenshots.length === 0
              ? <Empty icon="✅" msg="스크린샷이 없습니다!" />
              : <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
                {result.screenshots.map((a, i) => (
                  <div key={i} className="file-row" style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={a.thumbUrl} alt={a.file.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{formatBytes(a.file.size)}</div>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px", backgroundColor: "rgba(59,130,246,0.12)", color: "#3b82f6", flexShrink: 0 }}>
                      스크린샷
                    </span>
                  </div>
                ))}
              </div>
          )}

          {/* Others tab */}
          {activeTab === "others" && (
            result.others.length === 0
              ? <Empty icon="📭" msg="기타 파일이 없습니다." />
              : <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
                {result.others.slice(0, 200).map((a, i) => (
                  <div key={i} className="file-row" style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={a.thumbUrl} alt={a.file.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{formatBytes(a.file.size)}</div>
                    </div>
                  </div>
                ))}
                {result.others.length > 200 && (
                  <div style={{ padding: "14px 16px", textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
                    외 {result.others.length - 200}개 더...
                  </div>
                )}
              </div>
          )}

          <div style={{ marginTop: "28px", padding: "16px 20px", backgroundColor: "rgba(108,99,255,0.06)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "12px" }}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <span style={{ color: "#a89fff", fontWeight: 600 }}>💡 </span>
              웹 브라우저는 파일을 직접 삭제할 수 없습니다. "삭제 목록 복사" 후 아이폰 사진 앱에서 해당 파일을 직접 삭제해 주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div style={{ padding: "48px", textAlign: "center", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
      <div style={{ fontSize: "36px", marginBottom: "10px" }}>{icon}</div>
      <p style={{ fontSize: "15px", color: "var(--text-secondary)" }}>{msg}</p>
    </div>
  );
}
