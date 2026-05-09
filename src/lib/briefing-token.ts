import { Redis } from "@upstash/redis";

function getRedisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis not configured");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

const tokenKey = (token: string) => `briefing:token:${token}`;
const emailKey = (email: string) => `briefing:token:email:${email}`;

export async function getOrCreateToken(email: string): Promise<string> {
  const r = redis();
  const existing = await r.get<string>(emailKey(email));
  if (existing) return existing;
  return createToken(email);
}

export async function createToken(email: string): Promise<string> {
  const r = redis();
  const token = crypto.randomUUID();
  const old = await r.get<string>(emailKey(email));
  if (old) await r.del(tokenKey(old));
  await r.set(tokenKey(token), email.toLowerCase());
  await r.set(emailKey(email.toLowerCase()), token);
  return token;
}

export async function getEmailFromToken(token: string): Promise<string | null> {
  return redis().get<string>(tokenKey(token));
}
