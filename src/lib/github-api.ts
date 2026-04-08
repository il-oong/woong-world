/**
 * GitHub API wrapper — fetches repo data for project pages.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const headers: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

export interface RepoInfo {
  name: string;
  description: string;
  language: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  topics: string[];
  homepage: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export async function getRepoInfo(fullName: string): Promise<RepoInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, { headers, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name: data.name,
      description: data.description || "",
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      updatedAt: data.updated_at,
      topics: data.topics || [],
      homepage: data.homepage || null,
    };
  } catch {
    return null;
  }
}

export async function getRecentCommits(fullName: string, count = 5): Promise<CommitInfo[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/commits?per_page=${count}`, { headers, next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: Record<string, unknown>) => {
      const commit = c.commit as Record<string, unknown>;
      const author = commit.author as Record<string, unknown>;
      return {
        sha: (c.sha as string).slice(0, 7),
        message: (commit.message as string).split("\n")[0],
        author: author.name as string,
        date: author.date as string,
      };
    });
  } catch {
    return [];
  }
}

export async function getReadme(fullName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 3000); // Limit size
  } catch {
    return null;
  }
}
