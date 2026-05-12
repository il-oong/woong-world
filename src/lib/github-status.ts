import type { Plugin, PluginStatus, StatusLevel } from "./plugins";

const GH_API = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

type CommitInfo = { sha: string; date: string; message: string };
type WorkflowRun = { conclusion: string | null; status: string; head_sha: string };
type CombinedStatus = {
  state: "success" | "pending" | "failure" | "error";
  statuses: { context: string; state: string; description?: string }[];
};

async function fetchLatestCommit(repo: string, branch: string): Promise<CommitInfo | null> {
  try {
    const res = await fetch(
      `${GH_API}/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      { headers: ghHeaders(), next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      sha: string;
      commit: { author: { date: string }; message: string };
    };
    return {
      sha: data.sha,
      date: data.commit.author.date,
      message: data.commit.message.split("\n")[0].slice(0, 120),
    };
  } catch {
    return null;
  }
}

async function fetchLatestRun(repo: string, branch: string): Promise<WorkflowRun | null> {
  try {
    const url = new URL(`${GH_API}/repos/${repo}/actions/runs`);
    url.searchParams.set("branch", branch);
    url.searchParams.set("per_page", "1");
    const res = await fetch(url.toString(), {
      headers: ghHeaders(),
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      workflow_runs?: WorkflowRun[];
    };
    return data.workflow_runs?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchCombinedStatus(
  repo: string,
  ref: string,
): Promise<CombinedStatus | null> {
  try {
    const res = await fetch(
      `${GH_API}/repos/${repo}/commits/${encodeURIComponent(ref)}/status`,
      { headers: ghHeaders(), next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as CombinedStatus;
  } catch {
    return null;
  }
}

async function fetchPrInfo(
  repo: string,
  prNumber: number,
): Promise<{ draft: boolean; merged: boolean; state: string; mergeable_state: string } | null> {
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/pulls/${prNumber}`, {
      headers: ghHeaders(),
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      draft: boolean;
      merged: boolean;
      state: string;
      mergeable_state: string;
    };
  } catch {
    return null;
  }
}

export async function getPluginStatus(plugin: Plugin): Promise<PluginStatus> {
  const [commit, run, pr] = await Promise.all([
    fetchLatestCommit(plugin.repo, plugin.branch),
    fetchLatestRun(plugin.repo, plugin.branch),
    plugin.pr != null ? fetchPrInfo(plugin.repo, plugin.pr) : Promise.resolve(null),
  ]);

  let level: StatusLevel = "unknown";
  let label = "상태 확인 불가";
  const details: string[] = [];

  if (commit) details.push(`최신 커밋 ${commit.sha.slice(0, 7)}: ${commit.message}`);

  if (run) {
    if (run.status !== "completed") {
      level = "yellow";
      label = "CI 진행 중";
      details.push(`워크플로우 ${run.status}`);
    } else if (run.conclusion === "success") {
      level = "green";
      label = "정상";
      details.push("최신 CI 통과");
    } else if (run.conclusion === "failure" || run.conclusion === "timed_out") {
      level = "red";
      label = "CI 실패";
      details.push(`워크플로우 결과: ${run.conclusion}`);
    } else {
      level = "yellow";
      label = `CI ${run.conclusion ?? "미확정"}`;
    }
  } else if (commit) {
    // No GitHub Actions workflow run — fall back to commit status (Vercel,
    // Railway, etc. push deployment results here even when Actions is unused).
    const status = await fetchCombinedStatus(plugin.repo, commit.sha);
    if (status && status.statuses.length > 0) {
      const contexts = status.statuses.map((s) => s.context).join(", ");
      if (status.state === "success") {
        level = "green";
        label = "정상";
        details.push(`${contexts} 배포 성공`);
      } else if (status.state === "pending") {
        level = "yellow";
        label = "배포 진행 중";
        details.push(`${contexts} pending`);
      } else {
        level = "red";
        label = "배포 실패";
        details.push(`${contexts} ${status.state}`);
      }
    } else {
      level = "yellow";
      label = "CI 미설정";
      details.push("워크플로우/배포 상태 신호가 없다.");
    }
  }

  if (pr) {
    if (pr.merged) {
      details.push(`PR #${plugin.pr} 머지 완료`);
    } else if (pr.state === "closed") {
      level = level === "green" ? "yellow" : level;
      label = "PR 닫힘";
      details.push(`PR #${plugin.pr} 닫힘`);
    } else if (pr.draft) {
      // Don't downgrade a green CI to yellow just because PR is draft —
      // but if we have no other signal, prefer yellow.
      if (level === "unknown") {
        level = "yellow";
        label = "초안 PR";
      } else {
        details.push(`PR #${plugin.pr} 초안`);
      }
    } else {
      details.push(`PR #${plugin.pr} 리뷰 대기`);
    }
  }

  return {
    pluginId: plugin.id,
    level,
    label,
    detail: details.join(" · ") || undefined,
    latestCommit: commit?.sha.slice(0, 7),
    ciConclusion: run?.conclusion ?? run?.status ?? undefined,
    openPrs: pr && !pr.merged && pr.state === "open" ? 1 : 0,
  };
}

export async function getAllPluginStatuses(plugins: Plugin[]): Promise<PluginStatus[]> {
  return Promise.all(plugins.map((p) => getPluginStatus(p)));
}
