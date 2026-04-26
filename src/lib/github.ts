type GitHubRepo = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
};

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function fetchRepo(slug: string): Promise<GitHubRepo | null> {
  const res = await fetch(`https://api.github.com/repos/${slug}`, {
    headers: authHeaders(),
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchUserRepos(username: string): Promise<GitHubRepo[]> {
  const url = `https://api.github.com/users/${username}/repos?per_page=100&sort=pushed&type=owner`;
  const res = await fetch(url, {
    headers: authHeaders(),
    next: { revalidate: 600 },
  });
  if (!res.ok) return [];
  const repos = (await res.json()) as GitHubRepo[];
  return repos.filter((r) => !r.fork && !r.archived);
}

export type RepoContent = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  html_url: string;
};

export async function fetchRepoContents(
  slug: string,
  path = "",
): Promise<RepoContent[] | null> {
  const url = `https://api.github.com/repos/${slug}/contents/${path}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RepoContent[] | RepoContent;
  if (!Array.isArray(data)) return null;
  return data;
}

type TreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

export type RepoDoc = {
  path: string;
  size: number;
  content: string;
  truncated: boolean;
  html_url: string;
};

const DOC_PRIORITY = [
  /^README(\.[a-z]+)?\.md$/i,
  /^SPEC(\.[a-z]+)?\.md$/i,
  /^(PLAN|ROADMAP|DESIGN|ARCHITECTURE)(\.[a-z]+)?\.md$/i,
  /^docs?\//i,
  /\.md$/i,
];

const MAX_FILES = 12;
const MAX_BYTES_PER_FILE = 64 * 1024;

function docPriority(path: string): number {
  for (let i = 0; i < DOC_PRIORITY.length; i++) {
    if (DOC_PRIORITY[i].test(path)) return i;
  }
  return DOC_PRIORITY.length;
}

export async function fetchRepoDocs(slug: string): Promise<RepoDoc[] | null> {
  const meta = await fetchRepo(slug);
  if (!meta) return null;
  const branch = (meta as GitHubRepo & { default_branch?: string }).default_branch ?? "main";

  const treeRes = await fetch(
    `https://api.github.com/repos/${slug}/git/trees/${branch}?recursive=1`,
    { headers: authHeaders(), next: { revalidate: 600 } },
  );
  if (!treeRes.ok) return null;
  const tree = (await treeRes.json()) as { tree?: TreeEntry[] };
  const mdFiles = (tree.tree ?? [])
    .filter((e) => e.type === "blob" && /\.md$/i.test(e.path))
    .sort((a, b) => {
      const pa = docPriority(a.path);
      const pb = docPriority(b.path);
      if (pa !== pb) return pa - pb;
      return a.path.localeCompare(b.path);
    })
    .slice(0, MAX_FILES);

  const docs: RepoDoc[] = [];
  for (const f of mdFiles) {
    const res = await fetch(
      `https://api.github.com/repos/${slug}/contents/${encodeURIComponent(f.path).replace(/%2F/g, "/")}`,
      { headers: authHeaders(), next: { revalidate: 600 } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as {
      content?: string;
      encoding?: string;
      size?: number;
      html_url?: string;
    };
    if (!data.content || data.encoding !== "base64") continue;
    const buf = Buffer.from(data.content, "base64");
    const slice = buf.subarray(0, MAX_BYTES_PER_FILE);
    docs.push({
      path: f.path,
      size: data.size ?? buf.byteLength,
      content: slice.toString("utf-8"),
      truncated: buf.byteLength > MAX_BYTES_PER_FILE,
      html_url: data.html_url ?? `https://github.com/${slug}/blob/${branch}/${f.path}`,
    });
  }
  return docs;
}

export type { GitHubRepo };
