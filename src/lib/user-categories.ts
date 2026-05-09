import { Redis } from "@upstash/redis";
import { DEFAULT_CATEGORIES, buildCategory, type Category } from "./categories";

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis credentials not set");
  return new Redis({ url, token });
}

type RawCategory = { id: string; label: string; colorId: string };

const key = (email: string) => `user:categories:${email}`;

export async function getUserCategories(email: string): Promise<Category[]> {
  try {
    const raw = await redis().get<RawCategory[]>(key(email));
    if (!raw || raw.length === 0) return DEFAULT_CATEGORIES;
    return raw.map(buildCategory);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export async function saveUserCategories(email: string, cats: RawCategory[]): Promise<void> {
  await redis().set(key(email), cats);
}
