import { isAdminSession } from "@/lib/admin";
import { gateCliRun, runClaude } from "@/lib/cli/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAdminSession())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { repo?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const repo = typeof body.repo === "string" ? body.repo : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!repo || !prompt) {
    return Response.json({ error: "missing_repo_or_prompt" }, { status: 400 });
  }

  const gate = await gateCliRun(repo);
  if (!gate.ok) {
    const status = gate.reason === "invalid_repo" ? 400 : 409;
    return Response.json({ error: gate.reason, ...gate }, { status });
  }

  const stream = runClaude(gate.cwd, prompt);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
