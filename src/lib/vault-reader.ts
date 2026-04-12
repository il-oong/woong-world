/**
 * Reads Obsidian vault files (meetings, tasks, issues) from the local filesystem.
 * Only works server-side (API routes).
 */

import fs from "fs";
import path from "path";

/**
 * VAULT_ROOT is derived exclusively from the OBSIDIAN_VAULT_PATH env var.
 * We intentionally do NOT fall back to a hardcoded path — previous versions
 * embedded an absolute Windows path containing a real user's OneDrive layout,
 * which leaked private filesystem info on every deploy and every error
 * response. When the env var is unset, the vault is simply considered
 * offline and all readers return empty arrays.
 */
const VAULT_ROOT = process.env.OBSIDIAN_VAULT_PATH
  ? path.resolve(process.env.OBSIDIAN_VAULT_PATH)
  : null;

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse(); // newest first
  } catch {
    return [];
  }
}

function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".md"))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

// ─── Meetings ───

export interface Meeting {
  date: string;
  type: string; // "주간회의" | "야간회의"
  time: string;
  content: string;
}

export function getRecentMeetings(days = 7): Meeting[] {
  if (!VAULT_ROOT) return [];
  const meetings: Meeting[] = [];
  const mtgDir = path.join(VAULT_ROOT, "회의록");
  const dateDirs = listDirs(mtgDir).slice(0, days);

  for (const dateStr of dateDirs) {
    const dayDir = path.join(mtgDir, dateStr);
    const files = listFiles(dayDir);
    for (const file of files) {
      const content = readFileIfExists(path.join(dayDir, file));
      if (!content) continue;
      const isAm = file.includes("09_00") || file.includes("주간");
      meetings.push({
        date: dateStr,
        type: isAm ? "주간회의" : "야간회의",
        time: isAm ? "09:00" : "19:00",
        content: content.slice(0, 2000),
      });
    }
  }

  return meetings;
}

// ─── Issues ───

export interface Issue {
  date: string;
  slot: string;
  content: string;
}

export function getRecentIssues(days = 3): Issue[] {
  if (!VAULT_ROOT) return [];
  const issues: Issue[] = [];
  const issueDir = path.join(VAULT_ROOT, "이슈");
  const dateDirs = listDirs(issueDir).slice(0, days);

  for (const dateStr of dateDirs) {
    const dayDir = path.join(issueDir, dateStr);
    const files = listFiles(dayDir);
    for (const file of files) {
      const content = readFileIfExists(path.join(dayDir, file));
      if (!content) continue;
      // Only include if has actual content (not just template)
      if (content.includes("- [ ]") || content.length > 200) {
        const slot = file.replace("이슈_", "").replace(".md", "").replace("_", ":");
        issues.push({ date: dateStr, slot, content: content.slice(0, 1000) });
      }
    }
  }

  return issues;
}

// ─── Tasks ───

export interface TaskItem {
  name: string;
  status: "pending" | "in_progress" | "done";
  priority: string;
  team: string;
}

export function getTasks(): TaskItem[] {
  if (!VAULT_ROOT) return [];
  const taskBoard = readFileIfExists(path.join(VAULT_ROOT, "업무", "전체 업무 보드.md"));
  if (!taskBoard) return [];

  const tasks: TaskItem[] = [];
  const lines = taskBoard.split("\n");
  let currentTeam = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentTeam = line.replace("## ", "").trim();
    }
    const taskMatch = line.match(/^- \[([ x/])\] (🔴|🟡|🟢) (.+?)(\s*`.*`)?$/);
    if (taskMatch) {
      const [, check, emoji, name] = taskMatch;
      tasks.push({
        name: name.trim(),
        status: check === "x" ? "done" : check === "/" ? "in_progress" : "pending",
        priority: emoji === "🔴" ? "high" : emoji === "🟡" ? "medium" : "low",
        team: currentTeam,
      });
    }
  }

  return tasks;
}

// ─── Vault status ───

export function getVaultStatus() {
  if (!VAULT_ROOT) return { connected: false };
  return { connected: fs.existsSync(VAULT_ROOT) };
}
