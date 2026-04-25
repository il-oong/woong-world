export const CATEGORIES = [
  { id: "portfolio", label: "Portfolio" },
  { id: "sites", label: "Sites" },
  { id: "prompts", label: "Prompts" },
  { id: "ideas", label: "Ideas" },
  { id: "games", label: "Games" },
  { id: "workflow", label: "Workflow" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

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
};
