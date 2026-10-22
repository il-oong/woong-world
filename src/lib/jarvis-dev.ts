const GH_API = "https://api.github.com";
export const DEV_TASK_LABEL = "jarvis-dev";

export type DevTaskPhase = "queued" | "working" | "pr_open" | "merged" | "failed" | "closed";

export type DevTaskStatus = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  phase: DevTaskPhase;
  createdAt: string;
  runUrl?: string;
  pr?: {
    number: number;
    url: string;
    state: "open" | "closed" | "merged";
    draft: boolean;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
  };
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

/** The workflow only watches this label, so make sure it exists first. 422 = already there. */
async function ensureLabel(): Promise<void> {
  const res = await fetch(`${GH_API}/repos/${repo()}/labels`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: DEV_TASK_LABEL,
      color: "5319e7",
      description: "웅허브 JARVIS 클라우드 개발 요청",
    }),
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`github_label_failed_${res.status}`);
  }
}

/** Opens the issue that triggers .github/workflows/jarvis-dev.yml. */
export async function createDevTaskIssue(input: {
  title: string;
  request: string;
}): Promise<{ number: number; url: string }> {
  await ensureLabel();
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
  const data = (await res.json()) as {
    number: number;
    html_url: string;
    labels?: { name?: string }[];
  };
  if (!data.labels?.some((l) => l.name === DEV_TASK_LABEL)) {
    throw new Error("github_label_not_attached");
  }
  return { number: data.number, url: data.html_url };
}

type Issue = {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  pull_request?: unknown;
  labels?: { name?: string }[];
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
  base: { ref: string };
  mergeable?: boolean | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};
type Run = {
  display_title: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
};

async function gh<T>(path: string): Promise<T | null> {
  const res = await fetch(`${GH_API}/repos/${repo()}${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as T) : null;
}

function buildStatus(issue: Issue, pulls: Pull[], runs: Run[]): DevTaskStatus {
  const ref = new RegExp(`(^|[^\\d])#${issue.number}(?!\\d)|issue-${issue.number}(?!\\d)`);
  const pull = pulls.find((p) => ref.test(`${p.title}\n${p.body ?? ""}\n${p.head.ref}`));
  const created = Date.parse(issue.created_at) - 5_000;
  const run = runs
    .filter((r) => r.display_title === issue.title && Date.parse(r.created_at) >= created)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

  let phase: DevTaskPhase = "queued";
  if (pull?.merged_at) phase = "merged";
  else if (pull?.state === "open") phase = "pr_open";
  else if (pull) phase = "closed";
  else if (run && run.status === "completed" && run.conclusion !== "success") phase = "failed";
  else if (run && run.status !== "queued") phase = "working";
  else if (issue.state === "closed") phase = "closed";

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state,
    phase,
    createdAt: issue.created_at,
    runUrl: run?.html_url,
    pr: pull
      ? {
          number: pull.number,
          url: pull.html_url,
          state: pull.merged_at ? "merged" : pull.state,
          draft: pull.draft,
          additions: pull.additions,
          deletions: pull.deletions,
          changedFiles: pull.changed_files,
        }
      : undefined,
  };
}

async function loadContext() {
  const [pulls, runs] = await Promise.all([
    gh<Pull[]>("/pulls?state=all&per_page=50&sort=created&direction=desc"),
    gh<{ workflow_runs: Run[] }>("/actions/workflows/jarvis-dev.yml/runs?per_page=30"),
  ]);
  return { pulls: pulls ?? [], runs: runs?.workflow_runs ?? [] };
}

/** Recent dev tasks with phase (queued/working/pr_open/merged/failed) and the PR the agent opened. */
export async function listDevTasks(limit = 20): Promise<DevTaskStatus[]> {
  const issues = await gh<Issue[]>(`/issues?labels=${DEV_TASK_LABEL}&state=all&per_page=${limit}`);
  if (!issues) throw new Error("github_issues_failed");
  const { pulls, runs } = await loadContext();
  return issues.filter((i) => !i.pull_request).map((i) => buildStatus(i, pulls, runs));
}

/** One task, with diff stats on its PR for the completion report. */
export async function getDevTask(number: number): Promise<DevTaskStatus | null> {
  const issue = await gh<Issue>(`/issues/${number}`);
  if (!issue || issue.pull_request) return null;
  if (!issue.labels?.some((l) => l.name === DEV_TASK_LABEL)) return null;
  const { pulls, runs } = await loadContext();
  const status = buildStatus(issue, pulls, runs);
  if (status.pr) {
    const detail = await gh<Pull>(`/pulls/${status.pr.number}`);
    if (detail) {
      status.pr.additions = detail.additions;
      status.pr.deletions = detail.deletions;
      status.pr.changedFiles = detail.changed_files;
    }
  }
  return status;
}

/** Merges a PR the JARVIS agent opened. Only claude/issue-N branches of jarvis-dev issues qualify. */
export async function mergeDevTaskPr(prNumber: number): Promise<{ sha: string }> {
  const pr = await gh<Pull>(`/pulls/${prNumber}`);
  if (!pr) throw new Error("pr_not_found");
  const m = /^claude\/issue-(\d+)$/.exec(pr.head.ref);
  if (!m) throw new Error("not_a_jarvis_pr");
  const issue = await gh<Issue>(`/issues/${m[1]}`);
  if (!issue?.labels?.some((l) => l.name === DEV_TASK_LABEL)) throw new Error("not_a_jarvis_pr");
  if (pr.merged_at) throw new Error("already_merged");
  if (pr.state !== "open") throw new Error("pr_closed");
  if (pr.draft) throw new Error("pr_is_draft");
  if (pr.mergeable === false) throw new Error("pr_not_mergeable");

  const res = await fetch(`${GH_API}/repos/${repo()}/pulls/${prNumber}/merge`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ merge_method: "merge" }),
  });
  if (!res.ok) throw new Error(`github_merge_failed_${res.status}`);
  return { sha: ((await res.json()) as { sha: string }).sha };
}
