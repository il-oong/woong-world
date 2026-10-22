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
// Right after the assistant stops talking its voice is still fading through the mic.
const TAIL_GUARD_MS = 700;
const BARGE_KEY = "jarvis.voice.bargeIn";

function readBargePref(): boolean {
  try {
    return localStorage.getItem(BARGE_KEY) === "1";
  } catch {
    return false;
  }
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What the user said while the assistant was talking: cut speech off, end voice mode, or nothing. */
const squash = (t: string) => t.replace(/[\s.,!?~…]/g, "");
const ECHO_MIN_CHARS = 6;

export function detectInterrupt(heard: string, spoken: string): "stop" | "end" | null {
  // A longer phrase that appears in the reply is the assistant's own voice coming back through
  // the mic. A short command ("중단") is always honored, even if the reply happens to contain it.
  const h = squash(heard);
  if (h.length > ECHO_MIN_CHARS && squash(spoken).includes(h)) return null;
  if (END_WORDS.test(heard)) return "end";
  if (INTERRUPT_WORDS.test(heard)) return "stop";
  return null;
}

/** Chrome fills the voice list asynchronously, so wait for it (up to 1s) before choosing. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1_000);
    synth.addEventListener("voiceschanged", done);
  });
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
  // Listening while the assistant talks picks up its own voice on laptop speakers, so it is opt-in.
  const [bargeIn, setBargeInState] = useState(readBargePref);
  const bargeRef = useRef(bargeIn);
  const lastSpoken = useRef("");
  const setBargeIn = useCallback((on: boolean) => {
    bargeRef.current = on;
    setBargeInState(on);
    try {
      localStorage.setItem(BARGE_KEY, on ? "1" : "0");
    } catch {
      // Preference just won't persist.
    }
  }, []);

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

  const speakWithBrowser = async (text: string, isStale: () => boolean) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const ko = (await loadVoices()).filter((v) => v.lang.toLowerCase().startsWith("ko"));
    if (isStale()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    const female = ko.find((v) => /female|yuna|sun-?hi|heami|유나|선희|혜미|여성/i.test(v.name));
    const voice = female ?? ko[0];
    if (voice) u.voice = voice;
    await new Promise<void>((resolve) => {
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  };

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
      const stopBarge = bargeRef.current
        ? startBarge(sid, text, (kind) => {
            interrupt();
            if (kind === "end") stop();
          })
        : () => {};
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
        await speakWithBrowser(text, () => sid !== session.current || interrupted);
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
      // Our own voice leaking into the mic right after speaking: drop it instead of sending it.
      const heard = squash(utterance);
      if (heard.length > ECHO_MIN_CHARS && squash(lastSpoken.current).includes(heard)) {
        listenRef.current(sid);
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
        if (reply) {
          lastSpoken.current = reply;
          await speak(reply, sid);
          await new Promise((resolve) => setTimeout(resolve, TAIL_GUARD_MS));
        }
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

  return { state, interim, error, supported, bargeIn, setBargeIn, start, stop };
}
