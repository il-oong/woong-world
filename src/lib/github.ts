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
};

export async function fetchRepo(slug: string): Promise<GitHubRepo | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${slug}`, {
    headers,
    next: { revalidate: 600 },
  });

  if (!res.ok) return null;
  return res.json();
}

export type { GitHubRepo };
