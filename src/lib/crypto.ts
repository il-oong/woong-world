import { Redis } from "@upstash/redis";

// ── Types ────────────────────────────────────────────────────────────────────

export type CryptoHolding = {
  id: string;
  coinId: string;       // CoinGecko id (예: "bitcoin", "ethereum")
  symbol: string;       // 표시용 (예: "BTC")
  name: string;
  qty: number;
  avgBuyPrice: number;  // USD 기준
  memo: string;
  addedAt: number;
};

export type CryptoTraderWeights = {
  saylor: number;     // BTC 맥시멀리스트 · 장기 hodl
  hayes: number;      // 매크로 파생 · 옵션·펀딩비
  planb: number;      // S2F · 반감기 사이클
  pal: number;        // 글로벌 매크로 · alt 분산
  woo: number;        // 온체인 지표 (NVT/MVRV)
};

export type CryptoSettings = {
  traderWeights: CryptoTraderWeights;
  defaultStopLossRate: number; // %
};

// ── Redis ───────────────────────────────────────────────────────────────────

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis credentials not configured");
  _redis = new Redis({ url, token });
  return _redis;
}

const e = (email: string) => email.toLowerCase();
const portfolioKey = (email: string) => `crypto:portfolio:${e(email)}`;
const settingsKey = (email: string) => `crypto:settings:${e(email)}`;

export const DEFAULT_CRYPTO_SETTINGS: CryptoSettings = {
  traderWeights: { saylor: 20, hayes: 20, planb: 20, pal: 20, woo: 20 },
  defaultStopLossRate: 15,
};

export function newCryptoId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Holdings ────────────────────────────────────────────────────────────────

export async function listCryptoHoldings(email: string): Promise<CryptoHolding[]> {
  const data = await redis().get<CryptoHolding[]>(portfolioKey(email));
  return Array.isArray(data) ? data.sort((a, b) => b.addedAt - a.addedAt) : [];
}

export async function saveCryptoHoldings(email: string, holdings: CryptoHolding[]): Promise<void> {
  await redis().set(portfolioKey(email), holdings);
}

export async function addCryptoHolding(
  email: string,
  input: Omit<CryptoHolding, "id" | "addedAt">,
): Promise<CryptoHolding> {
  const holdings = await listCryptoHoldings(email);
  const h: CryptoHolding = { ...input, id: newCryptoId(), addedAt: Date.now() };
  await saveCryptoHoldings(email, [...holdings, h]);
  return h;
}

export async function deleteCryptoHolding(email: string, id: string): Promise<boolean> {
  const holdings = await listCryptoHoldings(email);
  const next = holdings.filter((h) => h.id !== id);
  if (next.length === holdings.length) return false;
  await saveCryptoHoldings(email, next);
  return true;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getCryptoSettings(email: string): Promise<CryptoSettings> {
  const data = await redis().get<CryptoSettings>(settingsKey(email));
  return data ?? DEFAULT_CRYPTO_SETTINGS;
}

export async function saveCryptoSettings(email: string, settings: CryptoSettings): Promise<void> {
  await redis().set(settingsKey(email), settings);
}
