export const CATEGORIES = [
  { id: "portfolio", label: "Portfolio", color: "#a78bfa" },
  { id: "sites", label: "Sites", color: "#5eead4" },
  { id: "prompts", label: "Prompts", color: "#fbbf24" },
  { id: "ideas", label: "Ideas", color: "#f472b6" },
  { id: "games", label: "Games", color: "#fb7185" },
  { id: "workflow", label: "Workflow", color: "#34d399" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_BY_ID: Record<CategoryId, (typeof CATEGORIES)[number]> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
    CategoryId,
    (typeof CATEGORIES)[number]
  >;

export type ServiceSeed = {
  repo: string;
  category: CategoryId;
  url?: string;
  icon?: string;
  title?: string;
  description?: string;
  pinned?: boolean;
};

export type Service = ServiceSeed & {
  resolvedTitle: string;
  resolvedDescription: string;
  resolvedUrl: string;
  language?: string | null;
  topics?: string[];
  stars?: number;
  pushedAt?: string | null;
  isPrivate?: boolean;
  exists: boolean;
  curated: boolean;
};

const TOPIC_TO_CATEGORY: Record<string, CategoryId> = {
  portfolio: "portfolio",
  game: "games",
  games: "games",
  prompt: "prompts",
  prompts: "prompts",
  idea: "ideas",
  ideas: "ideas",
  workflow: "workflow",
  automation: "workflow",
  website: "sites",
  site: "sites",
  web: "sites",
};

export function inferCategory(topics: string[] | undefined): CategoryId {
  for (const t of topics ?? []) {
    const hit = TOPIC_TO_CATEGORY[t.toLowerCase()];
    if (hit) return hit;
  }
  return "workflow";
}
