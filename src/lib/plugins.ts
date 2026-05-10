import pluginsData from "@/data/plugins.json";

export type Plugin = {
  id: string;
  name: string;
  description: string;
  /** "owner/name" — GitHub repo for status checks. */
  repo: string;
  /** Branch to inspect for latest commit/CI. */
  branch: string;
  /** Open PR number (if plugin is being developed in a PR). */
  pr: number | null;
  /** In-app route within woong-world (when the plugin lives inside this repo). */
  path: string | null;
  /** External hosted URL (e.g., Vercel deployment of a separate repo). */
  url: string | null;
  /** Whether the plugin can render inside an iframe. */
  embeddable: boolean;
  /** Accent color for the card. */
  accent: string;
  tags: string[];
};

export type StatusLevel = "green" | "yellow" | "red" | "unknown";

export type PluginStatus = {
  pluginId: string;
  level: StatusLevel;
  /** Short label like "정상", "PR 검토 중", "CI 실패", "미배포". */
  label: string;
  /** Optional details (1–2 short sentences) for tooltip / assistant context. */
  detail?: string;
  /** Latest commit short SHA, if known. */
  latestCommit?: string;
  /** Latest CI/workflow run status, if known. */
  ciConclusion?: string;
  /** Open PRs against the plugin branch. */
  openPrs?: number;
};

export function getPlugins(): Plugin[] {
  return pluginsData as Plugin[];
}

export function getPlugin(id: string): Plugin | null {
  return (pluginsData as Plugin[]).find((p) => p.id === id) ?? null;
}

/** What URL should the iframe load for this plugin? Returns null if no embed source. */
export function pluginEmbedUrl(p: Plugin): string | null {
  if (p.url) return p.url;
  if (p.path) return p.path;
  return null;
}

/** External GitHub URL for the plugin's repo / PR. */
export function pluginGitHubUrl(p: Plugin): string {
  if (p.pr != null) return `https://github.com/${p.repo}/pull/${p.pr}`;
  return `https://github.com/${p.repo}/tree/${p.branch}`;
}
