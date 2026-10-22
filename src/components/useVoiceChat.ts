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
// Said while the assistant is talking: cut the speech off, or end voice mode entirely.
const INTERRUPT_WORDS = /(중단|그만|멈춰|스톱|정지)/;
const END_WORDS = /(대화 ?종료|음성 ?종료)/;
const BARGE_MAX_RESTARTS = 40;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What the user said while the assistant was talking: cut speech off, end voice mode, or nothing. */
export function detectInterrupt(heard: string, spoken: string): "stop" | "end" | null {
  // Ignore words the assistant itself is saying (speaker echo).
  const end = END_WORDS.exec(heard);
  if (end && !spoken.includes(end[0])) return "end";
  const hit = INTERRUPT_WORDS.exec(heard);
  if (hit && !spoken.includes(hit[0])) return "stop";
  return null;
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
  // Bumped on every start/stop so work from an earlier session can tell it is stale.
  const session = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  const listenRef = useRef<(sid: number) => void>(() => {});
  const interruptPlay = useRef<(() => void) | null>(null);
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  const stop = useCallback(() => {
    session.current += 1;
    active.current = false;
    ctrl.current?.abort();
    ctrl.current = null;
    interruptPlay.current?.();
    interruptPlay.current = null;
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
      const ko = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ko"));
      const female = ko.find((v) => /female|yuna|sun-?hi|heami|유나|선희|혜미|여성/i.test(v.name));
      const voice = female ?? ko[0];
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });

  /** Keeps the mic open while the assistant talks so "중단" can cut it off. Returns a stopper. */
  const startBarge = useCallback(
    (sid: number, spoken: string, onHit: (kind: "stop" | "end") => void) => {
      const Ctor = recognitionCtor();
      if (!Ctor) return () => {};
      let alive = true;
      let restarts = 0;
      let current: Recognition | null = null;
      const begin = () => {
        if (!alive || sid !== session.current || restarts++ > BARGE_MAX_RESTARTS) return;
        const r = new Ctor();
        current = r;
        r.lang = "ko-KR";
        r.interimResults = true;
        r.continuous = true;
        r.onresult = (e) => {
          let heard = "";
          for (let i = e.resultIndex; i < e.results.length; i++) heard += e.results[i][0].transcript;
          setInterim(heard);
          const kind = detectInterrupt(heard, spoken);
          if (kind) onHit(kind);
        };
        r.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") alive = false;
        };
        r.onend = () => {
          if (alive) setTimeout(begin, 250);
        };
        try {
          r.start();
        } catch {
          alive = false;
        }
      };
      begin();
      return () => {
        alive = false;
        current?.abort();
        setInterim("");
      };
    },
    [],
  );

  const speak = useCallback(
    async (text: string, sid: number) => {
      setState("speaking");
      const ac = new AbortController();
      ctrl.current = ac;
      let interrupted = false;
      const interrupt = () => {
        interrupted = true;
        ac.abort();
        audio.current?.pause();
        window.speechSynthesis?.cancel();
        interruptPlay.current?.();
      };
      const stopBarge = startBarge(sid, text, (kind) => {
        interrupt();
        if (kind === "end") stop();
      });
      try {
        const res = await fetch("/api/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("tts_failed");
        const blob = await res.blob();
        if (sid !== session.current || interrupted) return;
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        audio.current = el;
        await new Promise<void>((resolve, reject) => {
          interruptPlay.current = resolve;
          el.onended = () => resolve();
          el.onerror = () => reject(new Error("audio_failed"));
          el.play().catch(reject);
        });
        URL.revokeObjectURL(url);
      } catch {
        if (sid === session.current && !interrupted) await speakWithBrowser(text);
      } finally {
        interruptPlay.current = null;
        stopBarge();
        if (ctrl.current === ac) ctrl.current = null;
        audio.current = null;
      }
    },
    [startBarge, stop],
  );

  const listen = useCallback((sid: number) => {
    const Ctor = recognitionCtor();
    if (sid !== session.current || !Ctor) return;
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
      if (sid !== session.current) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("마이크 권한을 허용해 주세요.");
      } else {
        setError(`음성 인식 오류: ${e.error}`);
      }
      stop();
    };
    r.onend = () => {
      if (sid !== session.current) return;
      const utterance = finalText.trim();
      setInterim("");
      if (!utterance) {
        silent.current += 1;
        if (silent.current >= MAX_SILENT_ROUNDS) stop();
        else listenRef.current(sid);
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
        if (sid !== session.current) return;
        if (reply) await speak(reply, sid);
        if (sid === session.current) listenRef.current(sid);
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
    session.current += 1;
    active.current = true;
    listenRef.current(session.current);
  }, []);

  useEffect(() => stop, [stop]);

  return { state, interim, error, supported, start, stop };
}
