import { NextRequest, NextResponse } from "next/server";
import { getRepoInfo, getRecentCommits, getReadme } from "@/lib/github-api";

export async function GET(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo");

  if (!repo) {
    return NextResponse.json({ error: "repo param required (e.g. il-oong/ECHO)" }, { status: 400 });
  }

  const [info, commits, readme] = await Promise.all([
    getRepoInfo(repo),
    getRecentCommits(repo),
    getReadme(repo),
  ]);

  return NextResponse.json({ info, commits, readme });
}
