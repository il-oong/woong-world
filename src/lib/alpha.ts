import { Redis } from "@upstash/redis";

// ── Types ────────────────────────────────────────────────────────────────────

export type StockHolding = {
  id: string;
  ticker: string;
  name: string;
  market: "KR" | "US";
  qty: number;
  avgBuyPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  memo: string;
  addedAt: number;
};

export type WatchItem = {
  id: string;
  ticker: string;
  name: string;
  market: "KR" | "US";
  memo: string;
  addedAt: number;
};

export type PositionAction = "매수" | "매도" | "추매" | "절반매도" | "보유" | "관망";

export type EconEvent = {
  id: string;
  title: string;
  eventDate: string;
  importance: "high" | "medium" | "low";
  market: "KR" | "US" | "GLOBAL";
  memo: string;
  positionAdvice?: {
    summary: string;
    actions: {
      action: PositionAction;
      reason: string;
      timing: string;
    }[];
    riskNote: string;
    generatedAt: number;
  } | null;
  addedAt: number;
};

export type InvestSettings = {
  traderWeights: {
    livermore: number;
    oneil: number;
    weinstein: number;
    minervini: number;
    lynch: number;
  };
  defaultStopLossRate: number;
  // 사용자가 추천·분석을 집중시킬 섹터/테마 (자유 입력, 쉼표 구분 권장)
  // 예: "반도체, AI 인프라, 방어주, 배당주"
  focusThemes?: string;
};

export type JkpAnalysisResult = {
  final_action: string;
  confidence: number;
  buy_zone: {
    entry_price: string;
    entry_condition: string;
    additional_buy: string;
  };
  target_price: {
    target_1: string;
    target_1_reason: string;
    target_2: string;
    target_2_reason: string;
  };
  sell_plan: {
    partial_exit: string;       // 1차 목표 도달 시 부분 매도 전략
    full_exit: string;          // 완전 청산 조건
    trailing_stop: string;      // 트레일링 스탑 기준
  };
  stop_loss: string;
  stop_loss_reason: string;
  risk_reward_ratio: string;
  time_horizon: string;
  key_catalysts: string[];
  key_risks: string[];
  jkp_comment: string;
};

// ── Redis singleton ───────────────────────────────────────────────────────────

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis credentials not configured");
  _redis = new Redis({ url, token });
  return _redis;
}

// ── Key helpers ───────────────────────────────────────────────────────────────

const e = (email: string) => email.toLowerCase();
const portfolioKey = (email: string) => `alpha:portfolio:${e(email)}`;
const watchlistKey = (email: string) => `alpha:watchlist:${e(email)}`;
const calendarKey = (email: string) => `alpha:calendar:${e(email)}`;
const settingsKey = (email: string) => `alpha:settings:${e(email)}`;

const DEFAULT_SETTINGS: InvestSettings = {
  traderWeights: { livermore: 20, oneil: 20, weinstein: 20, minervini: 20, lynch: 20 },
  defaultStopLossRate: 7,
  focusThemes: "",
};

export function newAlphaId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function listHoldings(email: string): Promise<StockHolding[]> {
  const data = await redis().get<StockHolding[]>(portfolioKey(email));
  return Array.isArray(data) ? data.sort((a, b) => b.addedAt - a.addedAt) : [];
}

export async function saveHoldings(email: string, holdings: StockHolding[]): Promise<void> {
  await redis().set(portfolioKey(email), holdings);
}

export async function addHolding(
  email: string,
  input: Omit<StockHolding, "id" | "addedAt">,
): Promise<StockHolding> {
  const holdings = await listHoldings(email);
  const holding: StockHolding = { ...input, id: newAlphaId(), addedAt: Date.now() };
  await saveHoldings(email, [...holdings, holding]);
  return holding;
}

export async function updateHolding(
  email: string,
  id: string,
  patch: Partial<Omit<StockHolding, "id" | "addedAt">>,
): Promise<boolean> {
  const holdings = await listHoldings(email);
  const idx = holdings.findIndex((h) => h.id === id);
  if (idx === -1) return false;
  holdings[idx] = { ...holdings[idx], ...patch };
  await saveHoldings(email, holdings);
  return true;
}

export async function deleteHolding(email: string, id: string): Promise<boolean> {
  const holdings = await listHoldings(email);
  const next = holdings.filter((h) => h.id !== id);
  if (next.length === holdings.length) return false;
  await saveHoldings(email, next);
  return true;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export async function listWatchlist(email: string): Promise<WatchItem[]> {
  const data = await redis().get<WatchItem[]>(watchlistKey(email));
  return Array.isArray(data) ? data.sort((a, b) => b.addedAt - a.addedAt) : [];
}

export async function saveWatchlist(email: string, items: WatchItem[]): Promise<void> {
  await redis().set(watchlistKey(email), items);
}

export async function addWatchItem(
  email: string,
  input: Omit<WatchItem, "id" | "addedAt">,
): Promise<WatchItem> {
  const items = await listWatchlist(email);
  const item: WatchItem = { ...input, id: newAlphaId(), addedAt: Date.now() };
  await saveWatchlist(email, [...items, item]);
  return item;
}

export async function deleteWatchItem(email: string, id: string): Promise<boolean> {
  const items = await listWatchlist(email);
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return false;
  await saveWatchlist(email, next);
  return true;
}

// ── Economic Calendar ─────────────────────────────────────────────────────────

export async function listEvents(email: string): Promise<EconEvent[]> {
  const data = await redis().get<EconEvent[]>(calendarKey(email));
  return Array.isArray(data) ? data.sort((a, b) => a.eventDate.localeCompare(b.eventDate)) : [];
}

export async function saveEvents(email: string, events: EconEvent[]): Promise<void> {
  await redis().set(calendarKey(email), events);
}

export async function addEvent(
  email: string,
  input: Omit<EconEvent, "id" | "addedAt" | "positionAdvice">,
): Promise<EconEvent> {
  const events = await listEvents(email);
  const ev: EconEvent = { ...input, id: newAlphaId(), positionAdvice: null, addedAt: Date.now() };
  await saveEvents(email, [...events, ev]);
  return ev;
}

export async function updateEventAdvice(
  email: string,
  id: string,
  advice: NonNullable<EconEvent["positionAdvice"]>,
): Promise<boolean> {
  const events = await listEvents(email);
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  events[idx] = { ...events[idx], positionAdvice: advice };
  await saveEvents(email, events);
  return true;
}

export async function deleteEvent(email: string, id: string): Promise<boolean> {
  const events = await listEvents(email);
  const next = events.filter((e) => e.id !== id);
  if (next.length === events.length) return false;
  await saveEvents(email, next);
  return true;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(email: string): Promise<InvestSettings> {
  const data = await redis().get<InvestSettings>(settingsKey(email));
  return data ?? DEFAULT_SETTINGS;
}

export async function saveSettings(email: string, settings: InvestSettings): Promise<void> {
  await redis().set(settingsKey(email), settings);
}
