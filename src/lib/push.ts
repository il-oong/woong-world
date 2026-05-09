import { Redis } from "@upstash/redis";
import webpush from "web-push";

export type PushRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  briefingHour: number;
};

// ─── VAPID ───────────────────────────────────────────────────────────────────

export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_EMAIL,
  );
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY not set");
  return key;
}

function setupVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

// ─── Redis ───────────────────────────────────────────────────────────────────

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

const subKey = (deviceId: string) => `push:sub:${deviceId}`;
const hourKey = (h: number) => `push:hour:${h}`;

export async function saveSubscription(
  deviceId: string,
  record: PushRecord,
  oldHour?: number,
): Promise<void> {
  const r = redis();
  await r.set(subKey(deviceId), record);
  if (oldHour !== undefined && oldHour !== record.briefingHour) {
    await r.srem(hourKey(oldHour), deviceId);
  }
  await r.sadd(hourKey(record.briefingHour), deviceId);
}

export async function removeSubscription(
  deviceId: string,
  briefingHour: number,
): Promise<void> {
  const r = redis();
  await r.del(subKey(deviceId));
  await r.srem(hourKey(briefingHour), deviceId);
}

export async function getSubscription(
  deviceId: string,
): Promise<PushRecord | null> {
  return redis().get<PushRecord>(subKey(deviceId));
}

export async function getSubscriptionsForHour(
  hour: number,
): Promise<{ deviceId: string; record: PushRecord }[]> {
  const r = redis();
  const deviceIds = await r.smembers<string[]>(hourKey(hour));
  if (!deviceIds.length) return [];
  const records = await Promise.all(
    deviceIds.map(async (id) => {
      const rec = await r.get<PushRecord>(subKey(id));
      return rec ? { deviceId: id, record: rec } : null;
    }),
  );
  return records.filter(
    (item): item is { deviceId: string; record: PushRecord } => item !== null,
  );
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendPushNotification(
  record: PushRecord,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  setupVapid();
  await webpush.sendNotification(
    { endpoint: record.endpoint, keys: record.keys },
    JSON.stringify(payload),
  );
}
