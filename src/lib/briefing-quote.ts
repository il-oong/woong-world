import { Redis } from "@upstash/redis";
import { askGemini } from "./gemini";

export type DailyQuote = { text: string; author: string };

const RECENT_MAX = 40;
const DAY_TTL_SECONDS = 2 * 86_400;

/** Well-known sayings and proverbs, used when the model is unavailable. Rotated by day of year. */
export const FALLBACK_QUOTES: DailyQuote[] = [
  { text: "천 리 길도 한 걸음부터.", author: "속담" },
  { text: "시작이 반이다.", author: "속담" },
  { text: "티끌 모아 태산.", author: "속담" },
  { text: "낙숫물이 댓돌을 뚫는다.", author: "속담" },
  { text: "급할수록 돌아가라.", author: "속담" },
  { text: "고생 끝에 낙이 온다.", author: "속담" },
  { text: "일찍 일어나는 새가 벌레를 잡는다.", author: "속담" },
  { text: "하늘은 스스로 돕는 자를 돕는다.", author: "속담" },
  { text: "백지장도 맞들면 낫다.", author: "속담" },
  { text: "아는 것이 힘이다.", author: "프랜시스 베이컨" },
  { text: "나는 생각한다, 고로 존재한다.", author: "데카르트" },
  { text: "작은 구멍이 큰 배를 가라앉힌다.", author: "벤저민 프랭클린" },
  { text: "오늘 할 수 있는 일을 내일로 미루지 마라.", author: "벤저민 프랭클린" },
  { text: "인생은 가까이서 보면 비극이지만 멀리서 보면 희극이다.", author: "찰리 채플린" },
  { text: "가장 어두운 밤도 결국 끝나고 해는 뜬다.", author: "빅토르 위고" },
  { text: "중요한 것은 꺾이지 않는 마음이다.", author: "작자 미상" },
  { text: "한 번에 한 걸음씩, 그러면 도착한다.", author: "작자 미상" },
  { text: "오늘의 작은 습관이 내일의 나를 만든다.", author: "작자 미상" },
];

/** Date key in Korea time, e.g. 2026-10-24. */
export function seoulDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}

export function fallbackQuote(dateKey: string): DailyQuote {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  return FALLBACK_QUOTES[dayOfYear % FALLBACK_QUOTES.length];
}

const squash = (t: string) => t.replace(/[\s.,!?'"“”‘’~…·-]/g, "").toLowerCase();

/** Parses the model's JSON; rejects anything too long to read aloud, empty, or already used. */
export function parseQuote(raw: string, recent: string[]): DailyQuote | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { text, author } = data as Record<string, unknown>;
  if (typeof text !== "string" || typeof author !== "string") return null;
  const t = text.trim().replace(/^["“”]+|["“”]+$/g, "");
  const a = author.trim().replace(/<[^>]*>/g, "").slice(0, 40);
  if (t.length < 6 || t.length > 90 || !a) return null;
  const key = squash(t);
  if (recent.some((r) => squash(r) === key)) return null;
  return { text: t, author: a };
}

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/**
 * Today's quote: the same all day (manual and scheduled briefings agree), different every day,
 * and never one of the recent ones. Falls back to a built-in list if the model fails.
 */
export async function getDailyQuote(email: string): Promise<DailyQuote> {
  const dateKey = seoulDateKey();
  const r = redis();
  const dayKey = `briefing:quote:${email.toLowerCase()}:${dateKey}`;
  const listKey = `briefing:quotes:${email.toLowerCase()}`;

  let recent: string[] = [];
  if (r) {
    try {
      const cached = await r.get<DailyQuote>(dayKey);
      if (cached?.text) return cached;
      recent = await r.lrange<string>(listKey, 0, RECENT_MAX - 1);
    } catch {
      // Redis is optional here; the quote still works without history.
    }
  }

  let quote: DailyQuote | null = null;
  try {
    const raw = await askGemini({
      json: true,
      temperature: 1,
      system:
        "너는 매일 아침 하나의 명언을 고르는 편집자다. 실제로 널리 알려진 인물의 말이나 속담만 골라라. 출처가 확실하지 않으면 author를 '속담' 또는 '작자 미상'으로 쓰고 인물 이름을 지어내지 마라. 한국어로 90자 이내, 소리 내어 읽기 좋게. 주제는 하루를 시작하는 용기, 꾸준함, 집중, 쉼 등으로 날마다 다르게. JSON 한 개만 출력: {\"text\":\"...\",\"author\":\"...\"}",
      prompt: `오늘 날짜: ${dateKey}\n\n[최근에 쓴 명언 — 이것들과 겹치면 안 된다]\n${recent.map((t) => `- ${t}`).join("\n") || "(없음)"}`,
    });
    quote = parseQuote(raw, recent);
  } catch {
    // Use the fallback below.
  }
  if (!quote) {
    const base = fallbackQuote(dateKey);
    // If the day's fallback was used recently, step through the list to find an unused one.
    const used = new Set(recent.map(squash));
    quote =
      [base, ...FALLBACK_QUOTES].find((q) => !used.has(squash(q.text))) ?? base;
  }

  if (r) {
    try {
      // Set-if-absent: when a manual and a scheduled briefing race, exactly one quote wins and
      // the loser returns the winner, so the whole day sees the same quote and history gets one entry.
      const won = await r.set(dayKey, quote, { nx: true, ex: DAY_TTL_SECONDS });
      if (won) {
        await r.lpush(listKey, quote.text);
        await r.ltrim(listKey, 0, RECENT_MAX - 1);
      } else {
        const stored = await r.get<DailyQuote>(dayKey);
        if (stored?.text) return stored;
      }
    } catch {
      // Not fatal.
    }
  }
  return quote;
}
