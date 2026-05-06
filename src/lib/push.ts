import webpush from "web-push";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export function initVapid() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails("mailto:admin@woong-world.app", pub, priv);
}

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const PUSH_KEY = "push:subscriptions";

export async function saveSub(sub: PushSub): Promise<void> {
  await redis.sadd(PUSH_KEY, JSON.stringify(sub));
}

export async function removeSub(endpoint: string): Promise<void> {
  const all = await redis.smembers(PUSH_KEY);
  for (const raw of all) {
    try {
      const s = JSON.parse(raw as string) as PushSub;
      if (s.endpoint === endpoint) await redis.srem(PUSH_KEY, raw);
    } catch {}
  }
}

export async function getAllSubs(): Promise<PushSub[]> {
  const all = await redis.smembers(PUSH_KEY);
  return (all as string[]).flatMap((raw) => {
    try { return [JSON.parse(raw) as PushSub]; } catch { return []; }
  });
}

const CHEONGAK_SNAPSHOT_KEY = "cheongak:snapshot";

export async function getCheongakSnapshot(): Promise<string[]> {
  const raw = await redis.get<string>(CHEONGAK_SNAPSHOT_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function saveCheongakSnapshot(ids: string[]): Promise<void> {
  await redis.set(CHEONGAK_SNAPSHOT_KEY, JSON.stringify(ids));
}

export async function sendToAll(payload: { title: string; body: string; url?: string }) {
  initVapid();
  const subs = await getAllSubs();
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload));
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
      }
    })
  );
  for (const ep of dead) await removeSub(ep);
}
