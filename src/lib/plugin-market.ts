/**
 * 플러그인 마켓 — GitHub 토픽 검색으로 비서앱에 쓸 만한 오픈소스를
 * 분류(카테고리)별·랭킹별로 보여준다. 설치 = 허브 레지스트리에 등록.
 */
import { isValidPluginId } from "./plugins";

export type MarketCategoryId =
  | "ai"
  | "ui"
  | "productivity"
  | "automation"
  | "data"
  | "voice";

export type MarketCategory = {
  id: MarketCategoryId;
  label: string;
  emoji: string;
  description: string;
  /** GitHub topics — each is searched separately and merged. */
  topics: string[];
};

export const MARKET_CATEGORIES: MarketCategory[] = [
  {
    id: "ai",
    label: "AI 도움",
    emoji: "🤖",
    description: "에이전트·MCP 서버·LLM 도구 — 비서의 두뇌를 키워줍니다",
    topics: ["mcp-server", "claude-code", "ai-agents"],
  },
  {
    id: "ui",
    label: "그래픽·UI",
    emoji: "🎨",
    description: "컴포넌트·디자인 시스템·애니메이션 — 화면을 예쁘게",
    topics: ["ui-components", "design-system", "tailwindcss"],
  },
  {
    id: "productivity",
    label: "생산성",
    emoji: "✅",
    description: "노트·할 일·일정 관리",
    topics: ["productivity", "note-taking", "calendar"],
  },
  {
    id: "automation",
    label: "자동화",
    emoji: "⚙️",
    description: "워크플로·스케줄러·웹훅",
    topics: ["automation", "workflow-automation", "self-hosted"],
  },
  {
    id: "data",
    label: "데이터·차트",
    emoji: "📊",
    description: "시각화·대시보드·리포트",
    topics: ["data-visualization", "dashboard", "charts"],
  },
  {
    id: "voice",
    label: "음성·미디어",
    emoji: "🎙️",
    description: "TTS·STT·음성 비서",
    topics: ["text-to-speech", "speech-recognition", "voice-assistant"],
  },
];

export type MarketSort = "stars" | "updated" | "forks";

export type MarketItem = {
  /** "owner/name" */
  repo: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  updatedAt: string;
  branch: string;
  htmlUrl: string;
  homepage: string | null;
  topics: string[];
  /** 직접 받아서 쓸 수 있는 ZIP 주소 */
  zipUrl: string;
};

type GhRepo = {
  full_name: string;
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  license: { spdx_id: string | null } | null;
  pushed_at: string;
  default_branch: string;
  html_url: string;
  homepage: string | null;
  topics?: string[];
};

const GH_API = "https://api.github.com";
const MIN_STARS = 50;

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

function toItem(r: GhRepo): MarketItem {
  return {
    repo: r.full_name,
    name: r.name,
    description: (r.description ?? "").slice(0, 200),
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language,
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    updatedAt: r.pushed_at,
    branch: r.default_branch,
    htmlUrl: r.html_url,
    homepage: r.homepage || null,
    topics: (r.topics ?? []).slice(0, 6),
    zipUrl: `https://github.com/${r.full_name}/archive/refs/heads/${encodeURIComponent(r.default_branch)}.zip`,
  };
}

async function searchTopic(topic: string, sort: MarketSort): Promise<MarketItem[]> {
  const url = new URL(`${GH_API}/search/repositories`);
  url.searchParams.set("q", `topic:${topic} archived:false stars:>=${MIN_STARS}`);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "20");
  const res = await fetch(url.toString(), {
    headers: ghHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`github_${res.status}`);
  const data = (await res.json()) as { items?: GhRepo[] };
  return (data.items ?? []).map(toItem);
}

const SORTERS: Record<MarketSort, (a: MarketItem, b: MarketItem) => number> = {
  stars: (a, b) => b.stars - a.stars,
  forks: (a, b) => b.forks - a.forks,
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
};

/** 카테고리의 토픽들을 병렬 검색 → 중복 제거 → 정렬 후 상위 limit개. */
export async function fetchMarket(
  category: MarketCategoryId,
  sort: MarketSort,
  limit = 30,
): Promise<MarketItem[]> {
  const cat = MARKET_CATEGORIES.find((c) => c.id === category);
  if (!cat) throw new Error("invalid_category");
  const settled = await Promise.allSettled(
    cat.topics.map((t) => searchTopic(t, sort)),
  );
  const ok = settled.filter(
    (s): s is PromiseFulfilledResult<MarketItem[]> => s.status === "fulfilled",
  );
  // 전부 실패했을 때만 에러 (rate limit 등) — 일부 실패는 가진 것만 보여준다.
  if (ok.length === 0) {
    const first = settled[0];
    throw new Error(
      first?.status === "rejected" && first.reason instanceof Error
        ? first.reason.message
        : "github_error",
    );
  }
  const byRepo = new Map<string, MarketItem>();
  for (const s of ok) for (const it of s.value) byRepo.set(it.repo, it);
  return [...byRepo.values()].sort(SORTERS[sort]).slice(0, limit);
}

/** repo 이름에서 허브 플러그인 id를 만든다 (규칙에 안 맞으면 null). */
export function pluginIdFromRepo(repo: string): string | null {
  const name = repo.split("/")[1] ?? "";
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 41)
    .replace(/-+$/g, "");
  return id && isValidPluginId(id) ? id : null;
}
