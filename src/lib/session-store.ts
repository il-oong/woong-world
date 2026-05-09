import { Redis } from "@upstash/redis";
import type { GoogleSession } from "./session";

function getRedisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis credentials not set");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

// ─── Google 세션 (크론이 캘린더 접근용) ──────────────────────────────────────

const SESSION_TTL = 60 * 60 * 24 * 60; // 60일
const sessKey = (email: string) => `google:session:${email.toLowerCase()}`;

export async function saveSessionToRedis(session: GoogleSession): Promise<void> {
  if (!session.email) return;
  const r = redis();
  await r.set(sessKey(session.email), session, { ex: SESSION_TTL });
  await r.sadd("google:sessions", session.email.toLowerCase());
}

export async function updateSessionInRedis(session: GoogleSession): Promise<void> {
  if (!session.email) return;
  await redis().set(sessKey(session.email), session, { ex: SESSION_TTL });
}

export async function removeSessionFromRedis(email: string): Promise<void> {
  const r = redis();
  await r.del(sessKey(email.toLowerCase()));
  await r.srem("google:sessions", email.toLowerCase());
}

export async function getSessionFromRedis(
  email: string,
): Promise<GoogleSession | null> {
  return redis().get<GoogleSession>(sessKey(email.toLowerCase()));
}

export async function getAllSessionEmails(): Promise<string[]> {
  return (await redis().smembers<string[]>("google:sessions")) ?? [];
}

// ─── 브리핑 캐시 ──────────────────────────────────────────────────────────────

export type BriefingCache = {
  audioUrl: string;
  script: string;
  generatedAt: number;
};

const BRIEFING_TTL = 60 * 60 * 18; // 18시간
const briefKey = (email: string) => `briefing:cache:${email.toLowerCase()}`;

export async function saveBriefingCache(
  email: string,
  data: BriefingCache,
): Promise<void> {
  await redis().set(briefKey(email), data, { ex: BRIEFING_TTL });
}

export async function getBriefingCache(
  email: string,
): Promise<BriefingCache | null> {
  return redis().get<BriefingCache>(briefKey(email));
}
