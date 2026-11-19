/**
 * 플러그인 마켓 설명 한글 번역 (서버 전용 — Redis/Gemini 사용).
 * 클라이언트 번들에 섞이지 않도록 plugin-market.ts 와 분리했다.
 */
import { Redis } from "@upstash/redis";
import type { MarketItem } from "./plugin-market";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TRANSLATE_TTL_SEC = 60 * 60 * 24 * 30;
const HANGUL = /[가-힣]/;
const LATIN = /[A-Za-z]/;

type CachedDesc = { src: string; ko: string };

const descKey = (repo: string) => `market:desc-ko:${repo.toLowerCase()}`;

function marketRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/** 이미 한글이거나 번역할 영문이 없으면 건너뛴다. */
function needsTranslation(desc: string): boolean {
  return desc.length > 0 && LATIN.test(desc) && !HANGUL.test(desc);
}

async function translateBatch(texts: string[]): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || texts.length === 0) return null;
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text:
              "너는 소프트웨어 프로젝트 설명 번역가다. 입력 JSON 배열의 각 영어 문장을 자연스러운 한국어로 번역한다. " +
              "제품명·라이브러리명·고유명사·코드 용어(MCP, LLM, API 등)는 원문 그대로 둔다. " +
              "입력과 같은 길이·순서의 JSON 문자열 배열만 출력한다 (코드펜스·설명 금지).",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(texts) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    const parsed: unknown = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
    if (
      Array.isArray(parsed) &&
      parsed.length === texts.length &&
      parsed.every((v) => typeof v === "string")
    ) {
      return parsed as string[];
    }
  } catch {
    /* 파싱 실패 → 원문 유지 */
  }
  return null;
}

/**
 * 영어 설명을 한국어로 번역한다. 제목(repo/name)은 건드리지 않는다.
 * Redis 캐시 → 미스만 Gemini 한 번에 번역 → 캐시 저장. 어떤 단계가 실패해도 원문을 그대로 돌려준다.
 */
export async function translateDescriptions(items: MarketItem[]): Promise<MarketItem[]> {
  const targets = items.filter((it) => needsTranslation(it.description));
  if (targets.length === 0) return items;

  const redis = marketRedis();
  const ko = new Map<string, string>(); // repo -> 한글 설명

  if (redis) {
    try {
      const cached = await redis.mget<(CachedDesc | null)[]>(
        ...targets.map((it) => descKey(it.repo)),
      );
      targets.forEach((it, i) => {
        const c = cached[i];
        if (c && c.src === it.description && c.ko) ko.set(it.repo, c.ko);
      });
    } catch {
      /* 캐시 실패는 무시 */
    }
  }

  const missing = targets.filter((it) => !ko.has(it.repo));
  if (missing.length > 0) {
    try {
      const out = await translateBatch(missing.map((it) => it.description));
      if (out) {
        const pipe = redis?.pipeline();
        missing.forEach((it, i) => {
          const t = out[i].trim();
          if (!t) return;
          ko.set(it.repo, t);
          pipe?.set(descKey(it.repo), { src: it.description, ko: t } satisfies CachedDesc, {
            ex: TRANSLATE_TTL_SEC,
          });
        });
        await pipe?.exec().catch(() => undefined);
      }
    } catch {
      /* 번역 실패 → 원문 */
    }
  }

  return items.map((it) => {
    const t = ko.get(it.repo);
    return t ? { ...it, description: t } : it;
  });
}

