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

export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const repo = req.nextUrl.searchParams.get("repo")?.trim() ?? "";
  if (!repo || !isValidRepo(repo)) {
    return Response.json({ error: "invalid_repo" }, { status: 400 });
  }

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

    return Response.json({
      name: data.name ?? "",
      description: data.description ?? "",
      defaultBranch: data.default_branch ?? "main",
      homepage: data.homepage ?? "",
      openPrs: openPrs.map((p) => ({
        number: p.number,
        title: p.title,
        draft: p.draft,
        branch: p.head?.ref ?? "",
      })),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "fetch_failed" },
      { status: 502 },
    );
  }
}
