import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { isValidRepo } from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

type TreeEntry = { path: string; type: "file" | "dir" };

async function fetchTopLevelTree(
  repo: string,
  branch: string,
): Promise<TreeEntry[]> {
  const res = await fetch(
    `${GH_API}/repos/${repo}/contents/?ref=${encodeURIComponent(branch)}`,
    { headers: ghHeaders(), next: { revalidate: 300 } },
  );
  if (!res.ok) return [];
  const items = (await res.json()) as { name: string; type: string }[];
  return items
    .filter((it) => it && typeof it.name === "string")
    .map<TreeEntry>((it) => ({
      path: it.name,
      type: it.type === "dir" ? "dir" : "file",
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
}

export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const repo = req.nextUrl.searchParams.get("repo")?.trim() ?? "";
  if (!repo || !isValidRepo(repo)) {
    return Response.json({ error: "invalid_repo" }, { status: 400 });
  }
  const wantTree = req.nextUrl.searchParams.get("tree") === "1";
  const branchParam = req.nextUrl.searchParams.get("branch")?.trim() || null;

  try {
    const [repoRes, prsRes] = await Promise.all([
      fetch(`${GH_API}/repos/${repo}`, {
        headers: ghHeaders(),
        next: { revalidate: 300 },
      }),
      fetch(`${GH_API}/repos/${repo}/pulls?state=open&per_page=5`, {
        headers: ghHeaders(),
        next: { revalidate: 300 },
      }),
    ]);

    if (repoRes.status === 404) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!repoRes.ok) {
      return Response.json(
        { error: `github_${repoRes.status}` },
        { status: 502 },
      );
    }

    const data = (await repoRes.json()) as {
      name?: string;
      description?: string | null;
      default_branch?: string;
      homepage?: string | null;
    };

    type GhPull = { number: number; title: string; draft: boolean; head?: { ref?: string } };
    let openPrs: GhPull[] = [];
    if (prsRes.ok) {
      const list = (await prsRes.json()) as GhPull[];
      openPrs = list.slice(0, 5);
    }

    const defaultBranch = data.default_branch ?? "main";
    let tree: TreeEntry[] | undefined;
    if (wantTree) {
      tree = await fetchTopLevelTree(repo, branchParam ?? defaultBranch);
    }

    return Response.json({
      name: data.name ?? "",
      description: data.description ?? "",
      defaultBranch,
      homepage: data.homepage ?? "",
      openPrs: openPrs.map((p) => ({
        number: p.number,
        title: p.title,
        draft: p.draft,
        branch: p.head?.ref ?? "",
      })),
      ...(tree !== undefined ? { tree } : {}),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "fetch_failed" },
      { status: 502 },
    );
  }
}
