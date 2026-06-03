"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MarketSentimentPoll from "./MarketSentimentPoll";
import type { MarketPost } from "@/lib/market";

type BoardTab = "KR" | "US" | "COIN";

const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: "KR", label: "국내주식토론" },
  { id: "US", label: "해외주식토론" },
  { id: "COIN", label: "코인토론" },
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  const d = new Date(ts);
  return `${(d.getMonth() + 1)}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StockTag({ tag }: { tag: MarketPost["stockTags"][0] }) {
  const pos = tag.change !== null && tag.change > 0;
  const neg = tag.change !== null && tag.change < 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono border ${
      pos ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
      neg ? "bg-rose-500/10 border-rose-500/30 text-rose-300" :
      "bg-zinc-800 border-zinc-700 text-zinc-400"
    }`}>
      <span className="font-semibold">{tag.ticker}</span>
      <span className="text-zinc-500">{tag.market}</span>
      {tag.change !== null && (
        <span>{pos ? "+" : ""}{tag.change.toFixed(2)}%</span>
      )}
      {tag.price !== null && (
        <span className="text-zinc-400">${tag.price.toFixed(2)}</span>
      )}
    </span>
  );
}

function PollCard({ post, onVote }: { post: MarketPost; onVote: (id: string, option: string) => void }) {
  const opts = post.pollOptions ?? [];
  const votes = post.pollVotes ?? {};
  const total = opts.reduce((s, o) => s + (votes[o] ?? 0), 0);
  const voted = localStorage.getItem(`poll-voted-${post.id}`);

  return (
    <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-300 font-medium mb-2">{post.content}</p>
      <div className="space-y-1.5">
        {opts.map((opt) => {
          const count = votes[opt] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <button
              key={opt}
              disabled={!!voted}
              onClick={() => onVote(post.id, opt)}
              className="relative w-full text-left rounded border border-zinc-700 overflow-hidden hover:border-zinc-600 disabled:cursor-default transition"
            >
              <div className="absolute inset-y-0 left-0 bg-amber-500/15" style={{ width: `${pct}%` }} />
              <div className="relative flex justify-between px-3 py-1.5 text-xs">
                <span className="text-zinc-300">{opt}</span>
                {voted && <span className="font-mono text-zinc-500">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      {total > 0 && <p className="mt-2 text-[10px] text-zinc-600">{total}명 참여</p>}
    </div>
  );
}

function PostCard({ post, onLike, onPollVote }: {
  post: MarketPost;
  onLike: (id: string) => void;
  onPollVote: (id: string, option: string) => void;
}) {
  const liked = typeof window !== "undefined" && localStorage.getItem(`liked-${post.id}`);

  return (
    <div className="grid grid-cols-[1fr_auto] border-b border-zinc-800/60 hover:bg-zinc-900/30 transition">
      <div className="px-4 py-3">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-zinc-300">{post.author}</span>
          <span className="text-[10px] text-zinc-600">{timeAgo(post.createdAt)}</span>
        </div>

        {/* Stock tags */}
        {post.stockTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {post.stockTags.map((tag, i) => <StockTag key={i} tag={tag} />)}
          </div>
        )}

        {/* Content or poll */}
        {post.isPoll ? (
          <PollCard post={post} onVote={onPollVote} />
        ) : (
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
        )}
      </div>

      {/* Like/report */}
      <div className="flex flex-col items-center justify-start gap-2 px-3 py-3 border-l border-zinc-800/40">
        <button
          onClick={() => onLike(post.id)}
          disabled={!!liked}
          className="flex flex-col items-center gap-0.5 text-zinc-600 hover:text-amber-400 transition disabled:cursor-default"
        >
          <span className="text-sm">👍</span>
          <span className="text-[9px] font-mono">{post.likes}</span>
        </button>
      </div>
    </div>
  );
}

function NewPostForm({ market, onPost }: { market: BoardTab; onPost: (p: MarketPost) => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState("");

  if (!open) {
    return (
      <div className="px-4 py-2 border-b border-zinc-800 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition"
        >
          글쓰기
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);

    // Parse @ticker tags from content
    const tagMatches = [...content.matchAll(/@([A-Z0-9^=\-\.]{1,10})/g)].map((m) => m[1]);
    const stockTags = tagMatches.map((ticker) => ({
      ticker,
      market: market === "KR" ? "KR" : "US",
      change: null,
      price: null,
    }));

    const res = await fetch("/api/market/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, market, stockTags }),
    });
    if (res.ok) {
      const p = await res.json();
      onPost(p);
      setContent("");
      setTagInput("");
      setOpen(false);
    }
    setSubmitting(false);
  };

  return (
    <div className="px-4 py-3 border-b border-zinc-800 space-y-2">
      <textarea
        autoFocus
        placeholder={`${market === "KR" ? "국내" : market === "US" ? "해외" : "코인"} 주식 이야기를 나누는 공간입니다.\n특정 종목 태그하기 : @종목명(공백없이)`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none resize-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); setContent(""); }} className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition">취소</button>
        <button
          onClick={submit}
          disabled={submitting || !content.trim()}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
        >
          {submitting ? "등록 중…" : "등록"}
        </button>
      </div>
    </div>
  );
}

export default function MarketBoard() {
  const [tab, setTab] = useState<BoardTab>("KR");
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadPosts = useCallback(async (market: BoardTab, p: number, replace = false) => {
    setLoading(true);
    const res = await fetch(`/api/market/posts?market=${market}&page=${p}`);
    if (res.ok) {
      const data = (await res.json()) as MarketPost[];
      setPosts((prev) => replace ? data : [...prev, ...data]);
      setHasMore(data.length >= 20);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setPage(1);
    loadPosts(tab, 1, true);
  }, [tab, loadPosts]);

  const handleLike = async (id: string) => {
    localStorage.setItem(`liked-${id}`, "1");
    const res = await fetch("/api/market/posts/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const { likes } = await res.json();
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, likes } : p));
    }
  };

  const handlePollVote = async (id: string, option: string) => {
    localStorage.setItem(`poll-voted-${id}`, option);
    const res = await fetch("/api/market/posts/poll-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, option }),
    });
    if (res.ok) {
      const { votes } = await res.json();
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, pollVotes: votes } : p));
    }
  };

  const handleNewPost = (p: MarketPost) => {
    setPosts((prev) => [p, ...prev]);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 shrink-0 overflow-x-auto scrollbar-none">
        {BOARD_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
              tab === t.id
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sentiment poll */}
      <MarketSentimentPoll market={tab} />

      {/* New post form */}
      <NewPostForm market={tab} onPost={handleNewPost} />

      {/* Posts */}
      <div className="flex-1 overflow-y-auto">
        {loading && posts.length === 0 ? (
          <div className="text-center py-10 text-xs text-zinc-700 animate-pulse">불러오는 중…</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-xs text-zinc-700">첫 번째 글을 작성해보세요.</div>
        ) : (
          <>
            {/* Column header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-0 px-4 py-1 border-b border-zinc-800/50 bg-zinc-900/30">
              <span className="text-[9px] font-mono text-zinc-700 uppercase w-20">작성자</span>
              <span className="text-[9px] font-mono text-zinc-700 uppercase">내용</span>
              <span className="text-[9px] font-mono text-zinc-700 uppercase w-16 text-right">시각</span>
              <span className="text-[9px] font-mono text-zinc-700 uppercase w-12 text-right">추천</span>
            </div>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onLike={handleLike} onPollVote={handlePollVote} />
            ))}
            {hasMore && (
              <div className="text-center py-4">
                <button
                  onClick={() => { const next = page + 1; setPage(next); loadPosts(tab, next); }}
                  disabled={loading}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition disabled:opacity-40"
                >
                  더 보기
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
