import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { Redis } from "@upstash/redis";
import { workspaceSchema, type Workspace } from "./mental-health";

export const RETENTION_SECONDS = 30 * 24 * 60 * 60;
function encryptionKey() {
  const key = process.env.MENTAL_HEALTH_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error("storage_unavailable");
  return Buffer.from(key, "hex");
}
function credentials() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  };
}
export function storageReady() {
  const { url, token } = credentials();
  return Boolean(
    url &&
    token &&
    /^[a-f0-9]{64}$/i.test(process.env.MENTAL_HEALTH_ENCRYPTION_KEY ?? ""),
  );
}
export function mentalRedis() {
  const { url, token } = credentials();
  if (!url || !token) throw new Error("storage_unavailable");
  return new Redis({ url, token });
}
export function ownerKey(email: string) {
  return (
    "mental:v1:" +
    createHmac("sha256", encryptionKey())
      .update(email.trim().toLowerCase())
      .digest("hex")
  );
}
export function encryptWorkspace(email: string, data: Workspace): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(ownerKey(email)));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(workspaceSchema.parse(data)), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64"))
    .join(".");
}
export function decryptWorkspace(email: string, value: string): Workspace {
  const [iv, tag, body] = value.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(ownerKey(email)));
  decipher.setAuthTag(tag);
  return workspaceSchema.parse(
    JSON.parse(
      Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
    ),
  );
}
type Stored = {
  revision: string;
  expiresAt: number;
  ciphertext: string | null;
};
export async function loadWorkspace(email: string) {
  const stored = await mentalRedis().get<Stored>(ownerKey(email));
  return {
    revision: stored?.revision ?? null,
    expiresAt: stored?.ciphertext ? stored.expiresAt : null,
    data: stored?.ciphertext
      ? decryptWorkspace(email, stored.ciphertext)
      : null,
  };
}
// Compare-and-set prevents an old tab from overwriting a newer save or deletion.
export const SAVE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local revision = ''
if current then revision = cjson.decode(current).revision end
if revision ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;
export async function saveWorkspace(
  email: string,
  data: Workspace,
  revision: string | null,
) {
  const stored: Stored = {
    revision: randomUUID(),
    expiresAt: Date.now() + RETENTION_SECONDS * 1000,
    ciphertext: encryptWorkspace(email, data),
  };
  const ok = await mentalRedis().eval(
    SAVE_SCRIPT,
    [ownerKey(email)],
    [revision ?? "", JSON.stringify(stored), RETENTION_SECONDS],
  );
  if (ok !== 1) throw new Error("conflict");
  return { revision: stored.revision, expiresAt: stored.expiresAt };
}
export async function deleteWorkspace(email: string) {
  // A non-sensitive tombstone invalidates pending saves from other tabs.
  const revision = randomUUID();
  await mentalRedis().set(
    ownerKey(email),
    { revision, expiresAt: 0, ciphertext: null },
    { ex: RETENTION_SECONDS },
  );
  return revision;
}
export async function allowAiRequest(email: string) {
  const count = await mentalRedis().eval(
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n",
    [ownerKey(email) + ":rate"],
    [],
  );
  return typeof count === "number" && count <= 12;
}
