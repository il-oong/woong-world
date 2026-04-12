import { NextRequest, NextResponse } from "next/server";
import { getTasks, getRecentIssues, getVaultStatus } from "@/lib/vault-reader";
import { clientKey, rateLimit, rateLimitResponse, sanitizeError } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "tasks"), 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const status = getVaultStatus();
    if (!status.connected) {
      return NextResponse.json({ tasks: [], issues: [], connected: false });
    }

    const tasks = getTasks();
    const issues = getRecentIssues(3);
    return NextResponse.json({ tasks, issues, connected: true });
  } catch (err) {
    console.error("tasks route error", err);
    return NextResponse.json(
      { tasks: [], issues: [], connected: false, error: sanitizeError(err) },
      { status: 500 },
    );
  }
}
