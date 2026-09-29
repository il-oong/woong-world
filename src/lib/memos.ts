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

// Stored as a Redis hash (field = memo id) rather than one JSON array under a
// single key: concurrent add/update/delete calls for the same account then
// touch only their own field instead of racing on a read-whole-list/
// write-whole-list round trip that could silently drop another request's
// change.
const hashKey = (email: string) => `memos:${email.toLowerCase()}`;

const MAX_ITEMS = 200;

export async function listMemos(email: string): Promise<Memo[]> {
  const data = await redis().hgetall<Record<string, Memo>>(hashKey(email));
  if (!data) return [];
  const all = Object.values(data);
  // pinned first (by updatedAt desc), then the rest (by updatedAt desc).
  const pinned = all.filter((m) => m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const rest = all.filter((m) => !m.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  return [...pinned, ...rest];
}

export async function addMemo(
  email: string,
  text: string,
  title: string = "",
): Promise<Memo> {
  const key = hashKey(email);
  const count = await redis().hlen(key);
  if (count >= MAX_ITEMS) {
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
  await redis().hset(key, { [memo.id]: memo });
  return memo;
}

export async function updateMemo(
  email: string,
  id: string,
  patch: { title?: string; text?: string; pinned?: boolean },
): Promise<Memo | null> {
  const key = hashKey(email);
  const prev = await redis().hget<Memo>(key, id);
  if (!prev) return null;
  const next: Memo = {
    ...prev,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
    updatedAt: Date.now(),
  };
  await redis().hset(key, { [id]: next });
  return next;
}

export async function removeMemo(email: string, id: string): Promise<boolean> {
  const removed = await redis().hdel(hashKey(email), id);
  return removed > 0;
}
