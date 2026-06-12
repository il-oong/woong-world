#!/usr/bin/env node
/**
 * vault-sync-daemon.mjs  —  Obsidian 보관함 자동 동기화 데몬
 *
 * Next.js(npm run dev) 없이 단독으로 실행되는 경량 백그라운드 프로세스.
 * .env.local 에서 설정을 읽어 파일 변경 감지 + 주기적 pull/push 를 수행한다.
 *
 * ─── 실행법 ─────────────────────────────────────────────────────────────────
 *   node vault-sync-daemon.mjs          직접 실행 (터미널 창 유지)
 *   npm run vault-sync                  package.json 스크립트
 *
 * ─── Windows 시작 프로그램 등록 (창 없이 백그라운드) ────────────────────────
 *   방법 1: start-vault-sync-hidden.vbs 를 시작 프로그램 폴더에 복사
 *     Win+R → shell:startup → start-vault-sync-hidden.vbs 바로가기 붙여넣기
 *
 *   방법 2: 작업 스케줄러 (Task Scheduler)
 *     작업 생성 → 트리거: 로그온 시 → 동작: node "경로\vault-sync-daemon.mjs"
 *     "숨김으로 실행" 체크
 *
 * ─── 로그 파일 ──────────────────────────────────────────────────────────────
 *   vault-sync-daemon.log  (프로젝트 루트, 자동 생성/관리)
 */

import { execFile } from "node:child_process";
import { promises as fs, watch as fsWatch, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// ── 로그 ─────────────────────────────────────────────────────────────────────

const LOG_PATH = path.join(ROOT, "vault-sync-daemon.log");
const LOG_MAX_BYTES = 1024 * 1024; // 1 MB 넘으면 로테이션

let logStream = createWriteStream(LOG_PATH, { flags: "a" });

async function rotateLogs() {
  try {
    const stat = await fs.stat(LOG_PATH);
    if (stat.size > LOG_MAX_BYTES) {
      logStream.end();
      await fs.rename(LOG_PATH, LOG_PATH + ".1");
      logStream = createWriteStream(LOG_PATH, { flags: "a" });
    }
  } catch { /* 로테이션 실패는 무시 */ }
}

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  logStream.write(line + "\n");
}
const info  = (msg) => log("INFO ", msg);
const warn  = (msg) => log("WARN ", msg);
const error = (msg) => log("ERROR", msg);

// ── 환경변수 (.env.local) ────────────────────────────────────────────────────

async function loadEnvLocal() {
  try {
    const text = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
    let loaded = 0;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) val = val.slice(1, -1);
      if (!(key in process.env)) { process.env[key] = val; loaded++; }
    }
    info(`.env.local 로드 (${loaded}개 변수)`);
  } catch {
    info(".env.local 없음 — 시스템 환경변수 사용");
  }
}

// ── 설정 ─────────────────────────────────────────────────────────────────────

function getConfig() {
  const vaultPath = (process.env.VAULT_SYNC_PATH || "obsidian")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  const raw = parseInt(process.env.VAULT_SYNC_PULL_INTERVAL_MS || "15000", 10);
  return {
    vaultPath,
    vaultAbsPath: path.join(ROOT, vaultPath),
    branchOverride: (process.env.VAULT_SYNC_BRANCH || "").trim(),
    remote: (process.env.VAULT_SYNC_REMOTE || "origin").trim(),
    pullIntervalMs: Number.isFinite(raw) && raw > 0 ? raw : 15000,
    externalPath: (process.env.VAULT_SYNC_EXTERNAL_PATH || "").trim(),
  };
}

// ── Git 헬퍼 ─────────────────────────────────────────────────────────────────

async function git(args) {
  try {
    const { stdout, stderr } = await exec("git", args, {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: (e.stderr || e.message || "git_failed").trim(),
    };
  }
}

async function effectiveBranch() {
  const { branchOverride } = getConfig();
  if (branchOverride) return branchOverride;
  const r = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.ok ? r.stdout.trim() : "main";
}

async function aheadBehind(branch) {
  const { remote } = getConfig();
  const ref = `${remote}/${branch}`;
  const v = await git(["rev-parse", "--verify", "--quiet", ref]);
  if (!v.ok || !v.stdout.trim()) return { ahead: 0, behind: 0, remoteExists: false };
  const rl = await git(["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
  if (!rl.ok) return { ahead: 0, behind: 0, remoteExists: true };
  const [a, b] = rl.stdout.trim().split(/\s+/);
  return { ahead: parseInt(a, 10) || 0, behind: parseInt(b, 10) || 0, remoteExists: true };
}

// ── 파일 미러링 ──────────────────────────────────────────────────────────────

const IGNORE_RE = /(?:^|[\\/])(?:\.git|\.obsidian)(?:[\\/]|$)|~$|\.tmp$|\(conflict /;

async function copyIfNewer(src, dst) {
  try {
    const [ss, ds] = await Promise.all([
      fs.stat(src),
      fs.stat(dst).catch(() => null),
    ]);
    if (ds && ss.mtimeMs <= ds.mtimeMs && ss.size === ds.size) return false;
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
    await fs.utimes(dst, ss.atime, ss.mtime);
    return true;
  } catch {
    return false;
  }
}

async function* walkFiles(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel  = path.relative(dir, full).replace(/\\/g, "/");
    if (IGNORE_RE.test(rel)) continue;
    if (e.isDirectory()) yield* walkFiles(full);
    else if (e.isFile()) yield { full, rel };
  }
}

async function mirrorDir(src, dst) {
  const srcMap = new Map();
  for await (const f of walkFiles(src)) srcMap.set(f.rel, f.full);

  if (srcMap.size === 0) {
    const dstList = await fs.readdir(dst).catch(() => []);
    if (dstList.length > 0) {
      warn(`미러 스킵: 원본(${src})이 비어있고 대상(${dst})에 파일 있음`);
      return { copied: 0, deleted: 0 };
    }
  }

  let copied = 0, deleted = 0;
  for (const [rel, srcFull] of srcMap) {
    if (await copyIfNewer(srcFull, path.join(dst, rel))) copied++;
  }
  for await (const f of walkFiles(dst)) {
    if (!srcMap.has(f.rel)) {
      await fs.unlink(f.full).catch(() => {});
      deleted++;
    }
  }
  return { copied, deleted };
}

// ── 충돌 처리 ────────────────────────────────────────────────────────────────

function conflictCopyName(relFile) {
  const dir  = path.dirname(relFile);
  const base = path.basename(relFile);
  const dot  = base.lastIndexOf(".");
  const d    = new Date();
  const p    = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
  const copy = dot > 0
    ? `${base.slice(0, dot)} (conflict ${stamp})${base.slice(dot)}`
    : `${base} (conflict ${stamp})`;
  return (dir === "." ? "" : dir.replace(/\\/g, "/") + "/") + copy;
}

async function mergeWithConflictHandling(branch) {
  const { remote, vaultPath } = getConfig();
  const merge = await git(["merge", "--no-edit", `${remote}/${branch}`]);
  if (merge.ok) return [];

  const u = await git(["diff", "--name-only", "--diff-filter=U"]);
  const files = u.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  if (files.length === 0) {
    await git(["merge", "--abort"]);
    warn(`병합 실패(충돌 아님): ${merge.stderr}`);
    return [];
  }

  const conflicts = [];
  for (const f of files) {
    const ours = await git(["show", `:2:${f}`]);
    if (ours.ok && ours.stdout.length > 0) {
      const copyRel = conflictCopyName(f);
      try {
        await fs.writeFile(path.join(ROOT, copyRel), ours.stdout, "utf8");
        conflicts.push(copyRel);
      } catch (e) {
        warn(`충돌본 저장 실패(${copyRel}): ${e.message}`);
      }
    }
    await git(["checkout", "--theirs", "--", f]);
    await git(["add", "--", f]);
  }
  await git(["add", "--", vaultPath]);
  const commit = await git(["commit", "--no-edit"]);
  if (!commit.ok) warn(`병합 커밋 실패: ${commit.stderr}`);
  return conflicts;
}

// ── 동기화 ──────────────────────────────────────────────────────────────────

let syncing = false;
let queued  = false;

async function runSync(reason) {
  const cfg    = getConfig();
  const branch = await effectiveBranch();

  // 0. 외부 보관함 → 레포 미러
  if (cfg.externalPath) {
    try { await fs.access(cfg.externalPath); }
    catch { warn(`외부 보관함 경로 없음: ${cfg.externalPath}`); return; }
    const m = await mirrorDir(cfg.externalPath, cfg.vaultAbsPath);
    if (m.copied || m.deleted)
      info(`보관함→레포 미러: 복사 ${m.copied}, 삭제 ${m.deleted}`);
  }

  // 1. 변경 커밋
  await git(["add", "--", cfg.vaultPath]);
  const staged = await git(["diff", "--cached", "--name-only", "--", cfg.vaultPath]);
  if (staged.ok && staged.stdout.trim()) {
    const c = await git(["commit", "-m", `vault: update notes (${reason})`, "--", cfg.vaultPath]);
    if (c.ok) info("변경 커밋 완료");
    else warn(`커밋 실패: ${c.stderr}`);
  }

  // 2. Fetch + 병합
  const fetch = await git(["fetch", cfg.remote, branch]);
  if (!fetch.ok) warn(`fetch 실패: ${fetch.stderr}`);

  const ab = await aheadBehind(branch);
  if (ab.remoteExists && ab.behind > 0) {
    const conflicts = await mergeWithConflictHandling(branch);
    if (conflicts.length > 0)
      info(`충돌 처리: 원격 내용으로 덮어쓰고 충돌본 ${conflicts.length}개 보존`);
    else
      info("원격 변경 병합 완료");
  }

  // 2.5. 레포 → 외부 보관함 미러 (병합 후)
  if (cfg.externalPath) {
    const m = await mirrorDir(cfg.vaultAbsPath, cfg.externalPath);
    if (m.copied || m.deleted)
      info(`레포→보관함 미러: 복사 ${m.copied}, 삭제 ${m.deleted}`);
  }

  // 3. Push
  const ab2 = await aheadBehind(branch);
  if (!ab2.remoteExists || ab2.ahead > 0) {
    const push = await git(["push", cfg.remote, `HEAD:${branch}`]);
    if (!push.ok) warn(`push 실패: ${push.stderr}`);
    else info("push 완료");
  }

  await rotateLogs();
}

async function syncNow(reason) {
  if (syncing) { queued = true; return; }
  syncing = true;
  try {
    info(`동기화 시작 (${reason})`);
    await runSync(reason);
    info("동기화 완료");
  } catch (e) {
    error(`동기화 실패: ${e.message}`);
  } finally {
    syncing = false;
  }
  if (queued) { queued = false; await syncNow("queued"); }
}

// ── 파일 감시 필터 ────────────────────────────────────────────────────────────

function shouldIgnore(filename) {
  const f = filename.replace(/\\/g, "/");
  return (
    f === ".git" || f.startsWith(".git/") || f.includes("/.git/") ||
    f.includes("/.obsidian/") || f.startsWith(".obsidian/") ||
    f.endsWith("~") || f.endsWith(".tmp") || f.includes("(conflict ")
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  await loadEnvLocal();
  const cfg = getConfig();

  info("=".repeat(50));
  info("Obsidian VaultSync 데몬 시작");
  info(`레포 루트   : ${ROOT}`);
  if (cfg.externalPath) {
    info(`외부 보관함 : ${cfg.externalPath}`);
    info(`레포 경로   : ${cfg.vaultAbsPath}`);
  } else {
    info(`보관함 경로 : ${cfg.vaultAbsPath}`);
    info(`힌트: VAULT_SYNC_EXTERNAL_PATH 를 .env.local 에 설정하면 진짜 옵시디언 폴더를 동기화합니다`);
  }
  info(`동기화 간격 : ${cfg.pullIntervalMs / 1000}초`);
  info("=".repeat(50));

  // 보관함 폴더 없으면 생성
  const watchTarget = cfg.externalPath || cfg.vaultAbsPath;
  try {
    await fs.access(watchTarget);
  } catch {
    if (!cfg.externalPath) {
      await fs.mkdir(watchTarget, { recursive: true });
      info(`보관함 폴더 생성: ${watchTarget}`);
    } else {
      error(`외부 보관함 경로를 찾을 수 없습니다: ${watchTarget}`);
      error(`VAULT_SYNC_EXTERNAL_PATH 설정을 확인하세요. 데몬을 종료합니다.`);
      process.exit(1);
    }
  }

  // 파일 변경 감시
  let debounce = null;
  try {
    fsWatch(watchTarget, { recursive: true }, (_evt, filename) => {
      if (filename && shouldIgnore(filename.toString())) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => syncNow("file-change"), 2500);
    });
    info(`파일 감시 시작: ${watchTarget}`);
  } catch (e) {
    warn(`파일 감시 실패: ${e.message} (주기 동기화만 작동)`);
  }

  // 주기적 pull
  setInterval(() => syncNow("interval"), cfg.pullIntervalMs);

  // 시작 직후 동기화
  await syncNow("startup");

  info("데몬 실행 중 — Ctrl+C 또는 SIGTERM 으로 종료");
}

process.on("SIGINT",  () => { info("데몬 종료 (SIGINT)");  process.exit(0); });
process.on("SIGTERM", () => { info("데몬 종료 (SIGTERM)"); process.exit(0); });
process.on("uncaughtException", (e) => {
  error(`예상치 못한 오류: ${e.message}`);
  // 데몬은 계속 실행 (오류 하나로 중단되지 않게)
});

main().catch((e) => {
  error(`초기화 실패: ${e.message}`);
  process.exit(1);
});
