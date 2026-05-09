import { Redis } from "@upstash/redis";

export type VoiceId =
  | "ko-KR-Wavenet-A"
  | "ko-KR-Wavenet-B"
  | "ko-KR-Wavenet-C"
  | "ko-KR-Wavenet-D";

export const VOICES: { id: VoiceId; label: string }[] = [
  { id: "ko-KR-Wavenet-A", label: "여성 1" },
  { id: "ko-KR-Wavenet-B", label: "남성 1" },
  { id: "ko-KR-Wavenet-C", label: "남성 2" },
  { id: "ko-KR-Wavenet-D", label: "여성 2" },
];

export type SecretaryProfile = {
  name: string;
  voiceId: VoiceId;
  briefingHour: number;
  briefingMinute: number;
  createdAt: number;
  updatedAt: number;
};

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
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

function profileKey(email: string): string {
  return `secretary:${email.toLowerCase()}`;
}

export function isStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

export async function getProfile(email: string): Promise<SecretaryProfile | null> {
  return redis().get<SecretaryProfile>(profileKey(email));
}

export async function saveProfile(
  email: string,
  input: { name: string; voiceId: VoiceId; briefingHour: number; briefingMinute: number },
): Promise<SecretaryProfile> {
  const existing = await getProfile(email);
  const now = Date.now();
  const profile: SecretaryProfile = {
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await redis().set(profileKey(email), profile);
  return profile;
}
