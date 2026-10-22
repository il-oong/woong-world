const GH_API = "https://api.github.com";
export const DEV_TASK_LABEL = "jarvis-dev";

export type DevTaskStatus = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  createdAt: string;
  pr?: { number: number; url: string; state: "open" | "closed" | "merged"; draft: boolean };
};

function repo(): string {
  return process.env.JARVIS_DEV_REPO ?? "il-oong/woong-world";
}

function headers(): HeadersInit {
  const token = process.env.JARVIS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("github_token_missing");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** Opens the issue that triggers .github/workflows/jarvis-dev.yml. */
export async function createDevTaskIssue(input: {
  title: string;
  request: string;
}): Promise<{ number: number; url: string }> {
  const res = await fetch(`${GH_API}/repos/${repo()}/issues`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: input.title,
      body: `${input.request}\n\n---\n_Requested from 웅허브 JARVIS. PR만 만들고 머지하지 않는다._`,
      labels: [DEV_TASK_LABEL],
    }),
  });
  if (!res.ok) {
    throw new Error(`github_issue_failed_${res.status}`);
  }
  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, url: data.html_url };
}

type Issue = {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  pull_request?: unknown;
};
type Pull = {
  number: number;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  merged_at: string | null;
  title: string;
  body: string | null;
  head: { ref: string };
};

/** Recent dev tasks with the pull request the agent opened for each. */
export async function listDevTasks(limit = 20): Promise<DevTaskStatus[]> {
  const h = headers();
  const [issuesRes, pullsRes] = await Promise.all([
    fetch(
      `${GH_API}/repos/${repo()}/issues?labels=${DEV_TASK_LABEL}&state=all&per_page=${limit}`,
      { headers: h, cache: "no-store" },
    ),
    fetch(`${GH_API}/repos/${repo()}/pulls?state=all&per_page=50&sort=created&direction=desc`, {
      headers: h,
      cache: "no-store",
    }),
  ]);
  if (!issuesRes.ok) throw new Error(`github_issues_failed_${issuesRes.status}`);
  const issues = ((await issuesRes.json()) as Issue[]).filter((i) => !i.pull_request);
  const pulls = pullsRes.ok ? ((await pullsRes.json()) as Pull[]) : [];

  return issues.map((issue) => {
    const ref = new RegExp(`(^|[^\\d])#${issue.number}(?!\\d)|issue-${issue.number}(?!\\d)`);
    const pull = pulls.find((p) => ref.test(`${p.title}\n${p.body ?? ""}\n${p.head.ref}`));
    return {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      createdAt: issue.created_at,
      pr: pull
        ? {
            number: pull.number,
            url: pull.html_url,
            state: pull.merged_at ? "merged" : pull.state,
            draft: pull.draft,
          }
        : undefined,
    };
  });
}
