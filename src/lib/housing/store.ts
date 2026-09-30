import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import {
  profileSchema,
  type Notice,
  type Profile,
  type Commute,
  todayKst,
} from "./model";
import { mergeCatalog } from "./catalog";

export function housingStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
export function userKey(email: string) {
  return `housing:v1:user:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`;
}
export async function getNotices(): Promise<Notice[]> {
  const db = housingStore();
  if (!db) return mergeCatalog();
  const records =
    await db.hgetall<Record<string, Notice>>("housing:v1:notices");
  return mergeCatalog(records ?? {});
}
export async function saveNotice(n: Notice) {
  const db = housingStore();
  if (!db) throw Error("저장소가 연결되지 않았습니다");
  await db.hset("housing:v1:notices", { [n.id]: n });
}
export async function getProfile(email: string): Promise<Profile | null> {
  const raw = await housingStore()?.get(`${userKey(email)}:profile`);
  return raw ? profileSchema.parse(raw) : null;
}
export function routeFingerprint(n: Notice, p: Profile) {
  return createHash("sha256")
    .update(JSON.stringify([n.point, p.workplace, todayKst()]))
    .digest("hex");
}
export async function getCommutes(
  email: string,
  notices: Notice[],
  profile: Profile | null,
) {
  if (!profile) return {};
  const data = await housingStore()?.hgetall<
    Record<string, { fingerprint: string; commute: Commute }>
  >(`${userKey(email)}:commutes`);
  return Object.fromEntries(
    notices.map((n) => [
      n.id,
      data?.[n.id]?.fingerprint === routeFingerprint(n, profile)
        ? data[n.id].commute
        : null,
    ]),
  );
}
