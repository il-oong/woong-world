import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 외부 옵시디언 보관함 ↔ 레포 `obsidian/` 폴더 미러링.
 *
 * git은 레포 안 파일만 커밋할 수 있으므로, 사용자의 진짜 보관함(레포 밖 절대경로)을
 * 동기화하려면 커밋 전 보관함 → 레포로, pull 후 레포 → 보관함으로 파일을 복사해야
 * 한다. 외부 의존성 없이 fs만 사용한다.
 *
 * 안전장치: 원본이 비어있는데 대상에 파일이 있으면(=경로 오설정 가능성) 통째로
 * 지우지 않고 에러를 던진다.
 */

function ignored(rel: string): boolean {
  const f = rel.replace(/\\/g, "/");
  return (
    f === ".git" ||
    f.startsWith(".git/") ||
    f.includes("/.git/") ||
    f === ".obsidian" ||
    f.startsWith(".obsidian/") ||
    f.includes("/.obsidian/") ||
    f.endsWith("~") ||
    f.endsWith(".tmp") ||
    f.includes("(conflict ")
  );
}

/** root 아래 모든 파일의 상대경로 목록(무시 규칙 적용). */
async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (ignored(rel)) continue;
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(rel);
    }
  }
  await walk(root);
  return out;
}

async function differs(src: string, dst: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fs.stat(src), fs.stat(dst)]);
    return sa.size !== sb.size || Math.floor(sa.mtimeMs) !== Math.floor(sb.mtimeMs);
  } catch {
    return true; // dst 없음 등 → 복사 필요
  }
}

/** 대상 트리에서 비게 된 디렉터리 정리(루트는 유지). */
async function pruneEmptyDirs(root: string): Promise<void> {
  async function walk(dir: string): Promise<boolean> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    let empty = true;
    for (const e of entries) {
      if (e.name === ".git" || e.name === ".obsidian") {
        empty = false;
        continue;
      }
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        const childEmpty = await walk(abs);
        if (childEmpty && dir !== root) {
          await fs.rmdir(abs).catch(() => {});
        } else {
          empty = false;
        }
      } else {
        empty = false;
      }
    }
    return empty;
  }
  await walk(root);
}

export type MirrorResult = { copied: number; deleted: number };

/**
 * srcDir → dstDir 미러: 바뀐 파일 복사, src에 없는 dst 파일 삭제.
 * .git/.obsidian/임시·충돌 사본은 건드리지 않는다.
 */
export async function mirrorDir(srcDir: string, dstDir: string): Promise<MirrorResult> {
  await fs.mkdir(dstDir, { recursive: true });
  const [srcFiles, dstFiles] = await Promise.all([
    listFiles(srcDir),
    listFiles(dstDir),
  ]);

  // 안전장치: 원본이 비어있는데 대상엔 파일이 있으면 경로 오설정으로 보고 거부.
  if (srcFiles.length === 0 && dstFiles.length > 0) {
    throw new Error(
      `미러링 거부: 원본(${srcDir})이 비어있어 대상 파일 ${dstFiles.length}개를 삭제할 뻔했습니다. 경로를 확인하세요.`,
    );
  }

  const srcSet = new Set(srcFiles);
  let copied = 0;
  let deleted = 0;

  for (const rel of srcFiles) {
    const s = path.join(srcDir, rel);
    const d = path.join(dstDir, rel);
    if (await differs(s, d)) {
      await fs.mkdir(path.dirname(d), { recursive: true });
      await fs.copyFile(s, d);
      // 다음 비교에서 재복사되지 않도록 mtime을 원본과 맞춘다.
      try {
        const st = await fs.stat(s);
        await fs.utimes(d, st.atime, st.mtime);
      } catch {
        /* best-effort */
      }
      copied++;
    }
  }

  for (const rel of dstFiles) {
    if (!srcSet.has(rel)) {
      await fs.rm(path.join(dstDir, rel), { force: true });
      deleted++;
    }
  }

  await pruneEmptyDirs(dstDir);
  return { copied, deleted };
}

/** 외부 보관함 경로가 실제 디렉터리인지 검증. 아니면 throw. */
export async function assertVaultDir(p: string): Promise<void> {
  let st;
  try {
    st = await fs.stat(p);
  } catch {
    throw new Error(`옵시디언 보관함 경로를 찾을 수 없습니다: ${p}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`옵시디언 보관함 경로가 폴더가 아닙니다: ${p}`);
  }
}
