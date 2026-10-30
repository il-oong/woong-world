"use client";

import { useRef, useState } from "react";
import {
  combineMemory,
  parseMemoryText,
  MEMORY_FILE_MAX_BYTES,
  MEMORY_MAX_LENGTH,
} from "@/lib/mental-health-memory";
import styles from "./mental-health.module.css";

export function MemoryImport({
  current,
  onApply,
}: {
  current: string;
  onApply: (memory: string) => void;
}) {
  const [preview, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  function errorMessage(error: unknown) {
    return error instanceof Error && error.message === "memory_too_long"
      ? "합친 기억이 2,000자를 넘습니다. 내용을 줄이거나 기존 기억을 바꾸는 방법을 선택해 주세요."
      : "비어 있지 않은 2,000자 이내 TXT 파일을 선택해 주세요.";
  }
  async function readFile(file: File | undefined) {
    const id = ++generation.current;
    setPreview("");
    setNotice("");
    setLoading(false);
    if (!file) return;
    if (!/\.txt$/i.test(file.name) || file.size > MEMORY_FILE_MAX_BYTES) {
      setNotice("700KB 이하의 TXT 파일만 불러올 수 있습니다.");
      return;
    }
    setLoading(true);
    try {
      const memory = parseMemoryText(await file.text());
      if (id === generation.current) setPreview(memory);
    } catch (error) {
      if (id === generation.current) setNotice(errorMessage(error));
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  function apply(replace: boolean) {
    try {
      const memory = combineMemory(current, preview, replace);
      if (
        replace &&
        current.trim() &&
        !confirm(
          "기존 기억을 아래 내용으로 바꿀까요? 기존 내용은 이 입력란에서 사라집니다.",
        )
      )
        return;
      onApply(memory);
      setPreview("");
      setNotice(
        "기억 입력란에 반영했어요. 서버에 보관하려면 암호화 저장을 눌러 주세요. AI 전송은 상담에서 별도로 선택합니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  return (
    <div>
      <h3>이전 상담에서 정리한 기억 가져오기</h3>
      <p className={styles.small}>
        파일은 이 화면에서만 읽습니다. 가져오기만으로 서버 저장이나 AI 전송은
        하지 않습니다. 확인 가능한 사실과 내 해석을 구분한 요약을 사용하세요.
      </p>
      <label className={styles.field}>
        <span>개인 기억 TXT 파일 선택</span>
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <div className={styles.help}>
          <label className={styles.field}>
            <span>가져올 기억 미리보기 · 수정 가능</span>
            <textarea
              rows={8}
              maxLength={MEMORY_MAX_LENGTH}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button
              disabled={loading || !preview.trim()}
              onClick={() => apply(false)}
            >
              {current.trim() ? "기존 기억에 합치기" : "이 내용을 기억에 반영"}
            </button>
            {current.trim() && (
              <button
                disabled={loading || !preview.trim()}
                onClick={() => apply(true)}
              >
                기존 기억 바꾸기
              </button>
            )}
            <button
              onClick={() => {
                generation.current++;
                setPreview("");
                setLoading(false);
              }}
            >
              가져오기 취소
            </button>
          </div>
        </div>
      )}
      <p role="status" className={styles.small}>
        {loading ? "파일을 읽고 있어요." : notice}
      </p>
    </div>
  );
}
