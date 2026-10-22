"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "off" | "listening" | "thinking" | "speaking";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionCtor = new () => Recognition;

const MAX_SILENT_ROUNDS = 3;
const STOP_WORDS = /^(그만|종료|끝|대화 종료|음성 종료)[.!? ]*$/;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Strips markup so the reply reads naturally out loud. */
export function toSpeakable(text: string): string {
  return text
    .replace(/<action>[\s\S]*?<\/action>/g, "")
    .replace(/```[\s\S]*?```/g, " 코드는 화면에서 확인해 주세요. ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "링크")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hands-free loop: listen -> hand the utterance to `handle` -> read the reply
 * aloud -> listen again. `handle` returns the text to speak (or null to skip).
 */
export function useVoiceChat(handle: (utterance: string) => Promise<string | null>) {
  const [state, setState] = useState<VoiceState>("off");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supported = recognitionCtor() !== null;

  const active = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const silent = useRef(0);
  const listenRef = useRef<() => void>(() => {});
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  const stop = useCallback(() => {
    active.current = false;
    rec.current?.abort();
    rec.current = null;
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setInterim("");
    setState("off");
  }, []);

  const speakWithBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });

  const speak = useCallback(async (text: string) => {
    setState("speaking");
    try {
      const res = await fetch("/api/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("tts_failed");
      const url = URL.createObjectURL(await res.blob());
      const el = new Audio(url);
      audio.current = el;
      await new Promise<void>((resolve, reject) => {
        el.onended = () => resolve();
        el.onerror = () => reject(new Error("audio_failed"));
        el.play().catch(reject);
      });
      URL.revokeObjectURL(url);
    } catch {
      if (active.current) await speakWithBrowser(text);
    } finally {
      audio.current = null;
    }
  }, []);

  const listen = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!active.current || !Ctor) return;
    const r = new Ctor();
    rec.current = r;
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    setState("listening");

    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const part = e.results[i];
        if (part.isFinal) finalText += part[0].transcript;
        else live += part[0].transcript;
      }
      setInterim(finalText + live);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("마이크 권한을 허용해 주세요.");
      } else {
        setError(`음성 인식 오류: ${e.error}`);
      }
      stop();
    };
    r.onend = () => {
      if (!active.current) return;
      const utterance = finalText.trim();
      setInterim("");
      if (!utterance) {
        silent.current += 1;
        if (silent.current >= MAX_SILENT_ROUNDS) stop();
        else listenRef.current();
        return;
      }
      silent.current = 0;
      if (STOP_WORDS.test(utterance)) {
        stop();
        return;
      }
      setState("thinking");
      void (async () => {
        let reply: string | null = null;
        try {
          reply = await handleRef.current(utterance);
        } catch {
          setError("응답을 받지 못했습니다.");
        }
        if (!active.current) return;
        if (reply) await speak(reply);
        if (active.current) listenRef.current();
      })();
    };
    r.start();
  }, [speak, stop]);
  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const start = useCallback(() => {
    if (active.current || !recognitionCtor()) return;
    setError(null);
    silent.current = 0;
    active.current = true;
    listenRef.current();
  }, []);

  useEffect(() => stop, [stop]);

  return { state, interim, error, supported, start, stop };
}
