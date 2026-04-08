import { NextResponse } from "next/server";
import { getTasks, getRecentIssues, getVaultStatus } from "@/lib/vault-reader";

export async function GET() {
  try {
    const status = getVaultStatus();
    if (!status.connected) {
      return NextResponse.json({ tasks: [], issues: [], connected: false });
    }

    const tasks = getTasks();
    const issues = getRecentIssues(3);
    return NextResponse.json({ tasks, issues, connected: true });
  } catch (err) {
    return NextResponse.json({ tasks: [], issues: [], connected: false, error: String(err) });
  }
}
