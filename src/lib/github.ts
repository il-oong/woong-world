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

export type { GitHubRepo };
