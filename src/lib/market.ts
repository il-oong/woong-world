import { Redis } from "@upstash/redis";

export type MarketPost = {
  id: string;
  author: string;
  content: string;
  market: "KR" | "US" | "COIN";
  stockTags: { ticker: string; market: string; change: number | null; price: number | null }[];
  likes: number;
  createdAt: number;
  isPoll?: boolean;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  stockTag?: { ticker: string; change: number | null; price: number | null; market: string } | null;
};

export type MarketSentimentVote = {
  up: number;
  down: number;
  mixed: number;
};

export type CustomTicker = {
  ticker: string;
  name: string;
  market: "KR" | "US" | "COIN" | "FX" | "IDX";
  source: "yahoo" | "national" | "binance";
  prefix?: string;
};

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis not configured");
  _redis = new Redis({ url, token });
  return _redis;
}

const postKey = (id: string) => `market:post:${id}`;
const postsListKey = (market: string) => `market:posts:${market}`;
const chatKey = () => `market:chat:messages`;
const pollKey = (date: string, market: string) => `market:poll:${date}:${market}`;
const tickersKey = (userId: string) => `market:tickers:${userId}`;

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPosts(market: string, page = 1, pageSize = 20): Promise<MarketPost[]> {
  const r = redis();
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const ids = await r.lrange(postsListKey(market), start, end);
  if (!ids.length) return [];
  const posts = await Promise.all(ids.map((id) => r.hgetall(postKey(id as string))));
  return posts
    .filter(Boolean)
    .map((raw) => {
      const p = raw as Record<string, unknown>;
      return {
        id: p.id as string,
        author: p.author as string,
        content: p.content as string,
        market: p.market as "KR" | "US" | "COIN",
        stockTags: JSON.parse((p.stockTags as string) || "[]"),
        likes: Number(p.likes ?? 0),
        createdAt: Number(p.createdAt ?? 0),
        isPoll: p.isPoll === "1",
        pollOptions: JSON.parse((p.pollOptions as string) || "null") ?? undefined,
        pollVotes: JSON.parse((p.pollVotes as string) || "null") ?? undefined,
      } as MarketPost;
    });
}

export async function createPost(post: Omit<MarketPost, "id" | "likes">): Promise<MarketPost> {
  const r = redis();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full: MarketPost = { ...post, id, likes: 0 };
  await r.hset(postKey(id), {
    id,
    author: full.author,
    content: full.content,
    market: full.market,
    stockTags: JSON.stringify(full.stockTags),
    likes: "0",
    createdAt: String(full.createdAt),
    isPoll: full.isPoll ? "1" : "0",
    pollOptions: JSON.stringify(full.pollOptions ?? null),
    pollVotes: JSON.stringify(full.pollVotes ?? null),
  });
  await r.lpush(postsListKey(post.market), id);
  await r.ltrim(postsListKey(post.market), 0, 999);
  return full;
}

export async function likePost(id: string): Promise<number> {
  const r = redis();
  return Number(await r.hincrby(postKey(id), "likes", 1));
}

export async function voteOnPoll(id: string, option: string): Promise<Record<string, number>> {
  const r = redis();
  const raw = await r.hgetall(postKey(id)) as Record<string, unknown> | null;
  if (!raw) return {};
  const votes: Record<string, number> = JSON.parse((raw.pollVotes as string) || "{}");
  votes[option] = (votes[option] ?? 0) + 1;
  await r.hset(postKey(id), { pollVotes: JSON.stringify(votes) });
  return votes;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function getChatMessages(limit = 60): Promise<ChatMessage[]> {
  const r = redis();
  const raw = await r.lrange(chatKey(), 0, limit - 1);
  return raw
    .map((item) => {
      try {
        return JSON.parse(item as string) as ChatMessage;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse() as ChatMessage[];
}

export async function addChatMessage(msg: Omit<ChatMessage, "id">): Promise<ChatMessage> {
  const r = redis();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const full: ChatMessage = { ...msg, id };
  await r.lpush(chatKey(), JSON.stringify(full));
  await r.ltrim(chatKey(), 0, 199);
  return full;
}

// ── Sentiment Poll ─────────────────────────────────────────────────────────────

export async function getSentimentPoll(date: string, market: string): Promise<MarketSentimentVote> {
  const r = redis();
  const raw = await r.hgetall(pollKey(date, market)) as Record<string, string> | null;
  return {
    up: Number(raw?.up ?? 0),
    down: Number(raw?.down ?? 0),
    mixed: Number(raw?.mixed ?? 0),
  };
}

export async function voteSentiment(date: string, market: string, direction: "up" | "down" | "mixed"): Promise<MarketSentimentVote> {
  const r = redis();
  const key = pollKey(date, market);
  await r.hincrby(key, direction, 1);
  await r.expire(key, 60 * 60 * 48);
  return getSentimentPoll(date, market);
}

// ── Custom Tickers ─────────────────────────────────────────────────────────────

export const DEFAULT_TICKERS: CustomTicker[] = [
  { ticker: "^KS11",  name: "코스피",       market: "IDX", source: "yahoo" },
  { ticker: "^TNX",   name: "미국채 10년",  market: "IDX", source: "yahoo", prefix: "" },
  { ticker: "NQ=F",   name: "나스닥 선물",  market: "IDX", source: "yahoo" },
  { ticker: "^IXIC",  name: "나스닥",       market: "IDX", source: "yahoo" },
  { ticker: "^GSPC",  name: "S&P500",       market: "IDX", source: "yahoo" },
  { ticker: "^DJI",   name: "다우",         market: "IDX", source: "yahoo" },
  { ticker: "TQQQ",   name: "TQQQ",         market: "US",  source: "yahoo", prefix: "$" },
  { ticker: "SOXL",   name: "SOXL",         market: "US",  source: "yahoo", prefix: "$" },
  { ticker: "NVDA",   name: "NVIDIA",       market: "US",  source: "yahoo", prefix: "$" },
  { ticker: "TSLA",   name: "Tesla",        market: "US",  source: "yahoo", prefix: "$" },
  { ticker: "AAPL",   name: "Apple",        market: "US",  source: "yahoo", prefix: "$" },
  { ticker: "CL=F",   name: "WTI 원유",     market: "IDX", source: "yahoo", prefix: "$" },
  { ticker: "KRW=X",  name: "원/달러",      market: "FX",  source: "yahoo", prefix: "₩" },
  { ticker: "BTC-USD",name: "BTC(USD)",     market: "COIN",source: "yahoo", prefix: "$" },
];

export async function getUserTickers(userId: string): Promise<CustomTicker[]> {
  const r = redis();
  const raw = await r.get(tickersKey(userId));
  if (!raw) return DEFAULT_TICKERS;
  try {
    return JSON.parse(raw as string) as CustomTicker[];
  } catch {
    return DEFAULT_TICKERS;
  }
}

export async function saveUserTickers(userId: string, tickers: CustomTicker[]): Promise<void> {
  const r = redis();
  await r.set(tickersKey(userId), JSON.stringify(tickers));
}
