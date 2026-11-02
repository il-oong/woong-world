import { type NextRequest } from "next/server";
import { isAdminSession } from "@/lib/admin";
import { isValidRepo } from "@/lib/plugins";
import { ensureSummaries } from "@/lib/plugin-market-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  items?: {
    repo?: unknown;
    description?: unknown;
    topics?: unknown;
    language?: unknown;
  }[];
};

/** 아직 요약이 없는 항목의 한 줄 요약을 생성한다 (결과는 repo → 요약). */
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const items = (body.items ?? []).slice(0, 30).flatMap((i) =>
    typeof i.repo === "string" && isValidRepo(i.repo)
      ? [
          {
            repo: i.repo,
            description: typeof i.description === "string" ? i.description : "",
            topics: Array.isArray(i.topics)
              ? i.topics.filter((t): t is string => typeof t === "string")
              : [],
            language: typeof i.language === "string" ? i.language : null,
          },
        ]
      : [],
  );
  const map = await ensureSummaries(items);
  return Response.json({ summaries: Object.fromEntries(map) });
}
