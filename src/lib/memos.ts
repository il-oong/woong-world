import { Redis } from "@upstash/redis";

export type Memo = {
  id: string;
  title: string;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isMemoStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis credentials not set");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

const listKey = (email: string) => `memos:${email.toLowerCase()}`;

const MAX_ITEMS = 200;

export async function listMemos(email: string): Promise<Memo[]> {
  const data = await redis().get<Memo[]>(listKey(email));
  if (!Array.isArray(data)) return [];
  // pinned first (by updatedAt desc), then the rest (by updatedAt desc).
  const pinned = data.filter((m) => m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const rest = data.filter((m) => !m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  return [...pinned, ...rest];
}

export async function addMemo(
  email: string,
  text: string,
  title: string = "",
): Promise<Memo> {
  const all = await listMemos(email);
  if (all.length >= MAX_ITEMS) {
    throw new Error("limit_exceeded");
  }
  const now = Date.now();
  const memo: Memo = {
    id: `mm_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    text,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  await redis().set(listKey(email), [...all, memo]);
  return memo;
}

export async function updateMemo(
  email: string,
  id: string,
  patch: { title?: string; text?: string; pinned?: boolean },
): Promise<Memo | null> {
  const all = await listMemos(email);
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const prev = all[idx];
  const next: Memo = {
    ...prev,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
    updatedAt: Date.now(),
  };
  all[idx] = next;
  await redis().set(listKey(email), all);
  return next;
}

export async function removeMemo(email: string, id: string): Promise<boolean> {
  const all = await listMemos(email);
  const next = all.filter((m) => m.id !== id);
  if (next.length === all.length) return false;
  await redis().set(listKey(email), next);
  return true;
}
