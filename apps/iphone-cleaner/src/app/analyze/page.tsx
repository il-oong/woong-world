"use client";

import { useState, useCallback } from "react";
import { scanDirectoryForImages, ScannedFile } from "@/lib/scanner";
import { hashFile } from "@/lib/file-hash";
import {
  getImageDimensions,
  isScreenshotByDimensions,
  isScreenshotByName,
  formatBytes,
} from "@/lib/image-utils";

type Phase = "idle" | "picking" | "scanning" | "hashing" | "done" | "error";

interface AnalysisResult {
  duplicateGroups: ScannedFile[][];
  screenshots: ScannedFile[];
  others: ScannedFile[];
  totalFiles: number;
  totalSize: number;
  potentialSavings: number;
}

interface FileStatus {
  [path: string]: "keep" | "delete";
}

export default function AnalyzePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fileStatus, setFileStatus] = useState<FileStatus>({});
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"duplicates" | "screenshots" | "others">("duplicates");

  const startAnalysis = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      setError(
        "이 브라우저는 File System Access API를 지원하지 않습니다.\nChrome 86+ 또는 Edge 86+을 사용해 주세요."
      );
      setPhase("error");
      return;
    }

    try {
      setPhase("picking");
      setError("");
      setResult(null);
      setFileStatus({});

      const dirHandle = await (window as typeof window & {
        showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: "read" });

      setPhase("scanning");
      setProgress({ current: 0, total: 0, label: "파일 스캔 중..." });

      const files = await scanDirectoryForImages(dirHandle, (count) => {
        setProgress({ current: count, total: 0, label: `파일 발견: ${count}개` });
      });

      if (files.length === 0) {
        setError("선택한 폴더에서 이미지 파일을 찾을 수 없습니다.\n아이폰의 DCIM 폴더를 선택했는지 확인해 주세요.");
        setPhase("error");
        return;
      }

      setPhase("hashing");
      setProgress({ current: 0, total: files.length, label: "파일 분석 중..." });

      const hashMap = new Map<string, ScannedFile[]>();
      const screenshots: ScannedFile[] = [];
      const others: ScannedFile[] = [];
      let totalSize = 0;

      const BATCH_SIZE = 10;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (sf) => {
            try {
              const hash = await hashFile(sf.file);
              const group = hashMap.get(hash) ?? [];
              group.push(sf);
              hashMap.set(hash, group);
              totalSize += sf.file.size;

              // Detect screenshots
              let isShot = isScreenshotByName(sf.file.name);
              if (!isShot) {
                try {
                  const dims = await getImageDimensions(sf.file);
                  isShot = isScreenshotByDimensions(dims.width, dims.height);
                } catch {
                  // ignore dimension errors
                }
              }

              if (isShot) {
                screenshots.push(sf);
              }
            } catch {
              // skip unreadable files
            }
          })
        );
        setProgress({
          current: Math.min(i + BATCH_SIZE, files.length),
          total: files.length,
          label: "파일 분석 중...",
        });
      }

      const duplicateGroups: ScannedFile[][] = [];
      for (const group of hashMap.values()) {
        if (group.length > 1) {
          duplicateGroups.push(group);
        }
      }

      // Others = not in any duplicate group and not a screenshot
      const duplicatePaths = new Set(duplicateGroups.flatMap((g) => g.map((f) => f.path)));
      const screenshotPaths = new Set(screenshots.map((f) => f.path));

      for (const sf of files) {
        if (!duplicatePaths.has(sf.path) && !screenshotPaths.has(sf.path)) {
          others.push(sf);
        }
      }

      // Default file status: keep first of each duplicate group, delete rest
      const initialStatus: FileStatus = {};
      for (const group of duplicateGroups) {
        group.forEach((sf, idx) => {
          initialStatus[sf.path] = idx === 0 ? "keep" : "delete";
        });
      }

      let potentialSavings = 0;
      for (const group of duplicateGroups) {
        group.slice(1).forEach((sf) => {
          potentialSavings += sf.file.size;
        });
      }
      for (const sf of screenshots) {
        potentialSavings += sf.file.size;
      }

      setFileStatus(initialStatus);
      setResult({
        duplicateGroups,
        screenshots,
        others,
        totalFiles: files.length,
        totalSize,
        potentialSavings,
      });
      setPhase("done");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setPhase("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setPhase("error");
    }
  }, []);

  const toggleFileStatus = (path: string) => {
    setFileStatus((prev) => ({
      ...prev,
      [path]: prev[path] === "delete" ? "keep" : "delete",
    }));
  };

  const copyDeleteList = async () => {
    if (!result) return;
    const toDelete: string[] = [];

    for (const group of result.duplicateGroups) {
      group.forEach((sf) => {
        if (fileStatus[sf.path] === "delete") {
          toDelete.push(sf.path);
        }
      });
    }
    for (const sf of result.screenshots) {
      toDelete.push(sf.path);
    }

    if (toDelete.length === 0) {
      alert("삭제할 파일이 없습니다.");
      return;
    }

    await navigator.clipboard.writeText(toDelete.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const deleteCount =
    result
      ? Object.values(fileStatus).filter((s) => s === "delete").length +
        result.screenshots.length
      : 0;

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.5px",
            marginBottom: "10px",
            color: "var(--text-primary)",
          }}
        >
          📷 사진 분석
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          아이폰의 DCIM 폴더를 선택하면 중복 사진과 스크린샷을 자동으로 찾아드립니다.
        </p>
      </div>

      {/* Start / Progress */}
      {(phase === "idle" || phase === "picking" || phase === "scanning" || phase === "hashing") && (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          {phase === "idle" && (
            <>
              <div style={{ fontSize: "56px", marginBottom: "20px" }}>📁</div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
                DCIM 폴더 선택
              </h2>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  marginBottom: "32px",
                  maxWidth: "420px",
                  margin: "0 auto 32px",
                }}
              >
                아이폰을 USB로 연결한 후, 탐색기에서 아이폰 장치 → Internal Storage → DCIM 폴더를 선택하세요.
              </p>
              <button
                onClick={startAnalysis}
                style={{
                  padding: "14px 36px",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#fff",
                  backgroundColor: "#6c63ff",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#7c73ff";
                  (e.target as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = "#6c63ff";
                  (e.target as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                폴더 선택하기
              </button>
            </>
          )}

          {(phase === "picking" || phase === "scanning" || phase === "hashing") && (
            <>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  margin: "0 auto 24px",
                  border: "3px solid var(--border)",
                  borderTopColor: "#6c63ff",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
                {phase === "picking" ? "폴더 선택 대기 중..." : progress.label}
              </h2>
              {phase !== "picking" && (
                <>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>
                    {progress.total > 0
                      ? `${progress.current} / ${progress.total} 파일`
                      : `${progress.current} 파일 발견`}
                  </p>
                  {progress.total > 0 && (
                    <div
                      style={{
                        maxWidth: "400px",
                        margin: "0 auto",
                        height: "6px",
                        backgroundColor: "var(--border)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(progress.current / progress.total) * 100}%`,
                          backgroundColor: "#6c63ff",
                          borderRadius: "3px",
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "14px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <p
            style={{
              fontSize: "15px",
              color: "#fca5a5",
              whiteSpace: "pre-line",
              lineHeight: 1.7,
              marginBottom: "24px",
            }}
          >
            {error}
          </p>
          <button
            onClick={() => setPhase("idle")}
            style={{
              padding: "10px 28px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#fff",
              backgroundColor: "#6c63ff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "32px",
            }}
          >
            {[
              {
                label: "전체 사진",
                value: `${result.totalFiles}개`,
                sub: formatBytes(result.totalSize),
                color: "#6c63ff",
                icon: "🖼️",
              },
              {
                label: "중복 그룹",
                value: `${result.duplicateGroups.length}개`,
                sub: `${result.duplicateGroups.reduce((a, g) => a + g.length, 0)}개 파일`,
                color: "#f59e0b",
                icon: "📋",
              },
              {
                label: "스크린샷",
                value: `${result.screenshots.length}개`,
                sub: formatBytes(result.screenshots.reduce((a, f) => a + f.file.size, 0)),
                color: "#3b82f6",
                icon: "📸",
              },
              {
                label: "절약 가능",
                value: formatBytes(result.potentialSavings),
                sub: "삭제 시 확보",
                color: "#22c55e",
                icon: "💾",
              },
            ].map((card, i) => (
              <div
                key={i}
                style={{
                  padding: "20px",
                  backgroundColor: "var(--bg-card)",
                  border: `1px solid ${card.color}30`,
                  borderRadius: "12px",
                  borderTop: `3px solid ${card.color}`,
                }}
              >
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>{card.icon}</div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: card.color, marginBottom: "2px" }}>
                  {card.value}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{card.label}</div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              삭제 대상: <span style={{ color: "#ef4444", fontWeight: 700 }}>{deleteCount}개</span> 파일
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={copyDeleteList}
                style={{
                  padding: "10px 22px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  backgroundColor: copied ? "#22c55e" : "#6c63ff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
              >
                {copied ? "✓ 복사됨!" : "삭제 목록 복사"}
              </button>
              <button
                onClick={() => {
                  setPhase("idle");
                  setResult(null);
                  setFileStatus({});
                }}
                style={{
                  padding: "10px 22px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                다시 분석
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              marginBottom: "24px",
              gap: "0",
            }}
          >
            {(
              [
                { key: "duplicates", label: `중복 사진 (${result.duplicateGroups.length}그룹)` },
                { key: "screenshots", label: `스크린샷 (${result.screenshots.length}개)` },
                { key: "others", label: `기타 (${result.others.length}개)` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  color: activeTab === tab.key ? "#6c63ff" : "var(--text-secondary)",
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid #6c63ff" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "duplicates" && (
            <div>
              {result.duplicateGroups.length === 0 ? (
                <EmptyState icon="✅" message="중복 사진이 없습니다!" />
              ) : (
                result.duplicateGroups.map((group, gi) => (
                  <div
                    key={gi}
                    style={{
                      marginBottom: "16px",
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--border)",
                        backgroundColor: "rgba(245, 158, 11, 0.06)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "#f59e0b", fontWeight: 700 }}>
                        중복 그룹 #{gi + 1}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {group.length}개 파일 · {formatBytes(group[0].file.size)} 각
                      </span>
                    </div>
                    {group.map((sf, fi) => {
                      const status = fileStatus[sf.path] ?? "keep";
                      return (
                        <div
                          key={fi}
                          style={{
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottom:
                              fi < group.length - 1 ? "1px solid var(--border)" : "none",
                            backgroundColor:
                              status === "delete" ? "rgba(239, 68, 68, 0.04)" : "transparent",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontSize: "18px" }}>🖼️</span>
                            <div>
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  color:
                                    status === "delete"
                                      ? "var(--text-secondary)"
                                      : "var(--text-primary)",
                                  textDecoration: status === "delete" ? "line-through" : "none",
                                  fontFamily: "monospace",
                                }}
                              >
                                {sf.path}
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                {formatBytes(sf.file.size)}
                                {fi === 0 && (
                                  <span
                                    style={{
                                      marginLeft: "8px",
                                      color: "#22c55e",
                                      fontWeight: 600,
                                    }}
                                  >
                                    원본 유지
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleFileStatus(sf.path)}
                            style={{
                              padding: "5px 14px",
                              fontSize: "12px",
                              fontWeight: 600,
                              color: status === "delete" ? "#ef4444" : "var(--text-secondary)",
                              backgroundColor:
                                status === "delete"
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "var(--bg-secondary)",
                              border: `1px solid ${status === "delete" ? "rgba(239, 68, 68, 0.3)" : "var(--border)"}`,
                              borderRadius: "6px",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            {status === "delete" ? "삭제 예정" : "유지"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "screenshots" && (
            <div>
              {result.screenshots.length === 0 ? (
                <EmptyState icon="✅" message="스크린샷이 없습니다!" />
              ) : (
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  {result.screenshots.map((sf, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom:
                          i < result.screenshots.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "16px" }}>📸</span>
                        <div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-primary)",
                              fontFamily: "monospace",
                            }}
                          >
                            {sf.path}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {formatBytes(sf.file.size)}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: "999px",
                          backgroundColor: "rgba(59, 130, 246, 0.12)",
                          color: "#3b82f6",
                        }}
                      >
                        스크린샷
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "others" && (
            <div>
              {result.others.length === 0 ? (
                <EmptyState icon="📭" message="기타 사진이 없습니다." />
              ) : (
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  {result.others.slice(0, 200).map((sf, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom:
                          i < Math.min(result.others.length, 200) - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "14px" }}>🖼️</span>
                        <span
                          style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            fontFamily: "monospace",
                          }}
                        >
                          {sf.path}
                        </span>
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)", flexShrink: 0 }}>
                        {formatBytes(sf.file.size)}
                      </span>
                    </div>
                  ))}
                  {result.others.length > 200 && (
                    <div
                      style={{
                        padding: "14px 16px",
                        textAlign: "center",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      외 {result.others.length - 200}개 더...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Copy info */}
          <div
            style={{
              marginTop: "32px",
              padding: "18px 22px",
              backgroundColor: "rgba(108, 99, 255, 0.06)",
              border: "1px solid rgba(108, 99, 255, 0.2)",
              borderRadius: "12px",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
              <span style={{ color: "#a89fff", fontWeight: 600 }}>💡 참고:</span> 웹 브라우저는 파일을 직접 삭제할 수
              없습니다. "삭제 목록 복사" 버튼으로 경로를 복사한 후 파일 탐색기에서 수동으로 삭제하거나,
              아이폰 사진 앱에서 직접 삭제해 주세요.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div
      style={{
        padding: "48px",
        textAlign: "center",
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
      }}
    >
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>{icon}</div>
      <p style={{ fontSize: "15px", color: "var(--text-secondary)" }}>{message}</p>
    </div>
  );
}
