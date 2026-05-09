import { Redis } from "@upstash/redis";

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis credentials not set");
  return new Redis({ url, token });
}

const key = (email: string) => `cal:filter:${email}`;

export async function getCalendarFilter(email: string): Promise<string[] | null> {
  try {
    const val = await redis().get<string[]>(key(email));
    return val ?? null;
  } catch {
    return null;
  }
}

export async function setCalendarFilter(email: string, calendarIds: string[]): Promise<void> {
  await redis().set(key(email), calendarIds);
}
