import { NextRequest, NextResponse } from "next/server";
import { getRepoInfo, getRecentCommits, getReadme } from "@/lib/github-api";
import { clientKey, rateLimit, rateLimitResponse, sanitizeError } from "@/lib/api-guard";

// owner/repo: GitHub allows alphanumerics, hyphens, underscores and dots.
// Anchored to block any path traversal or query injection attempts.
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "github"), 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  const repo = req.nextUrl.searchParams.get("repo");

  if (!repo || !REPO_PATTERN.test(repo)) {
    return NextResponse.json(
      { error: "invalid repo parameter (expected owner/name)" },
      { status: 400 },
    );
  }

  try {
    const [info, commits, readme] = await Promise.all([
      getRepoInfo(repo),
      getRecentCommits(repo),
      getReadme(repo),
    ]);

    return NextResponse.json({ info, commits, readme });
  } catch (err) {
    console.error("github route error", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
