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

/**
 * Synchronous read of the static seed registry. Use only when Redis is
 * unavailable or for build-time defaults — runtime callers should prefer
 * {@link loadPlugins} from `plugins-store.ts`.
 */
export function getSeedPlugins(): Plugin[] {
  return pluginsData as Plugin[];
}

/** What URL should the iframe load for this plugin? Returns null if no embed source or not embeddable. */
export function pluginEmbedUrl(p: Plugin): string | null {
  if (!p.embeddable) return null;
  if (p.url) return p.url;
  // Guard: paths under /plugins/* would iframe the viewer page itself
  // (which is /plugins/[id]) and cause infinite recursion.
  if (p.path && !p.path.startsWith("/plugins/")) return p.path;
  return null;
}

/** External GitHub URL for the plugin's repo / PR. */
export function pluginGitHubUrl(p: Plugin): string {
  if (p.pr != null) return `https://github.com/${p.repo}/pull/${p.pr}`;
  return `https://github.com/${p.repo}/tree/${p.branch}`;
}

/**
 * Plugin ids that must be rejected:
 *  - "status", "github-meta": collide with API route segments
 *  - "routine", "subscription": retired internal-app shortcuts that are now
 *    filtered out at load time in plugins-store. Allowing them at write time
 *    would create write-then-disappear records that can't be patched/deleted.
 */
const RESERVED_PLUGIN_IDS = new Set([
  "status",
  "github-meta",
  "routine",
  "subscription",
]);

/** Validate a plugin id: lowercase alphanumeric + dashes, not a reserved word. */
export function isValidPluginId(id: string): boolean {
  if (RESERVED_PLUGIN_IDS.has(id)) return false;
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(id);
}

/** Validate a "owner/name" GitHub repo string. */
export function isValidRepo(repo: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
}

