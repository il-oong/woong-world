import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { isLocalRuntime } from "@/lib/vault-sync/config";
import { isValidRepo } from "@/lib/plugins";

const exec = promisify(execFile);

/**
 * CLI engine — lets an admin run `claude -p "<prompt>"` against the local
 * clone of a plugin's repo, straight from the 웅허브 card. Local-only: there is
 * no `claude` binary and no persistent process on Vercel (same constraint as
 * VaultSync's git-CLI engine — see `isLocalRuntime`).
 *
 * Deliberately NOT a general shell. The only program ever spawned is `claude`;
 * the prompt is always passed as its own argv element (never shell-concatenated),
 * so it cannot inject extra commands.
 */

/** "owner/name" -> local clone path, or null if not cloned next to this repo. */
export async function resolveRepoPath(repo: string): Promise<string | null> {
  if (!isValidRepo(repo)) return null;
  const [, name] = repo.split("/");

  // This project's own repo: use the running working tree directly.
  if (await isSameRepo(repo)) return process.cwd();

  // Convention: sibling repos are cloned next to this one, e.g.
  // C:\Users\testos\woong-world (this repo) and C:\Users\testos\<name>.
  const candidate = path.resolve(process.cwd(), "..", name);
  return (await isGitRepoDir(candidate)) ? candidate : null;
}

async function isSameRepo(repo: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], {
      cwd: process.cwd(),
    });
    const url = stdout.trim().toLowerCase();
    return url.includes(repo.toLowerCase());
  } catch {
    return false;
  }
}

async function isGitRepoDir(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(path.join(dir, ".git"));
    return st.isDirectory() || st.isFile(); // worktree .git can be a file
  } catch {
    return false;
  }
}

export type CliRunGate =
  | { ok: true; cwd: string }
  | { ok: false; reason: "not_local" }
  | { ok: false; reason: "invalid_repo" }
  | { ok: false; reason: "not_cloned"; suggestedClone: string };

/** Everything a route needs to decide whether/how to run the CLI for a repo. */
export async function gateCliRun(repo: string): Promise<CliRunGate> {
  if (!isLocalRuntime()) return { ok: false, reason: "not_local" };
  if (!isValidRepo(repo)) return { ok: false, reason: "invalid_repo" };
  const cwd = await resolveRepoPath(repo);
  if (!cwd) {
    return { ok: false, reason: "not_cloned", suggestedClone: `gh repo clone ${repo}` };
  }
  return { ok: true, cwd };
}

/**
 * Run `claude -p <prompt>` in `cwd`, streaming raw stdout chunks as they
 * arrive. Caller already gated via {@link gateCliRun}.
 */
export function runClaude(cwd: string, prompt: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      // shell: true + an args array is the documented safe way to reach the
      // Windows .cmd shim for a globally-installed npm binary; Node escapes
      // each array element for the target shell, so `prompt` can't break out.
      const child = spawn("claude", ["-p", prompt, "--output-format", "stream-json"], {
        cwd,
        shell: true,
      });

      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      child.stderr.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      child.on("error", (err) => {
        controller.enqueue(Buffer.from(`\n[cli] spawn error: ${err.message}\n`));
        controller.close();
      });
      child.on("close", (code) => {
        controller.enqueue(Buffer.from(`\n[cli] exited ${code}\n`));
        controller.close();
      });
    },
  });
}
