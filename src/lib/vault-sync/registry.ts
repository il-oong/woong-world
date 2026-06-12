import { Redis } from "@upstash/redis";

/**
 * 여러 PC의 옵시디언 보관함 경로 레지스트리.
 *
 * 각 PC가 로컬에서 동기화/상태조회할 때 자기 hostname·보관함 경로를 Redis에
 * 등록한다. 배포본(휴대폰 등)에서도 이 목록을 읽어 "어떤 PC가 어떤 경로를
 * 동기화 중인지" 한눈에 볼 수 있다. 서로 같은 git 브랜치로 push/pull 하므로
 * 노트는 PC 간에 자동으로 오간다 — 이 레지스트리는 가시성·관리용이다.
 */

export type VaultMachine = {
  /** os.hostname() — 머신 식별자. */
  id: string;
  /** 사람이 읽는 라벨(기본 = hostname, VAULT_SYNC_MACHINE_LABEL로 지정 가능). */
  label: string;
  /** 이 PC가 동기화하는 보관함 절대경로. */
  path: string;
  /** 레포 밖 외부 보관함 경로면 true, 레포 내부 폴더면 false. */
  external: boolean;
  /** 동기화 대상 브랜치. */
  branch: string;
  /** process.platform (win32/darwin/linux 등). */
  platform: string;
  /** 마지막으로 이 PC가 동기화/상태조회한 시각(epoch ms). */
  lastSeen: number;
};

const KEY = "vault-sync:machines";

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

let _redis: Redis | null = null;
function redis(): Redis | null {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) return null;
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

export async function listMachines(): Promise<VaultMachine[]> {
  const r = redis();
  if (!r) return [];
  try {
    const data = await r.get<VaultMachine[]>(KEY);
    return Array.isArray(data)
      ? [...data].sort((a, b) => b.lastSeen - a.lastSeen)
      : [];
  } catch {
    return [];
  }
}

async function saveMachines(list: VaultMachine[]): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(KEY, list);
  } catch {
    /* best-effort */
  }
}

export type MachineInfo = Omit<VaultMachine, "lastSeen" | "label"> & {
  label?: string;
};

let _lastReg = 0;

/** 현재 PC를 레지스트리에 upsert(라벨은 기존 사용자 지정값 보존). */
export async function registerMachine(info: MachineInfo): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    const all = await listMachines();
    const idx = all.findIndex((m) => m.id === info.id);
    const existing = idx >= 0 ? all[idx] : null;
    const entry: VaultMachine = {
      id: info.id,
      label: info.label || existing?.label || info.id,
      path: info.path,
      external: info.external,
      branch: info.branch,
      platform: info.platform,
      lastSeen: Date.now(),
    };
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    await saveMachines(all);
    _lastReg = Date.now();
  } catch {
    /* best-effort */
  }
}

/** 상태 폴링용 — 60초에 한 번만 실제로 등록(Redis 쓰기 절약). */
export async function touchMachine(info: MachineInfo): Promise<void> {
  if (Date.now() - _lastReg < 60_000) return;
  await registerMachine(info);
}

export async function removeMachine(id: string): Promise<void> {
  const all = await listMachines();
  await saveMachines(all.filter((m) => m.id !== id));
}

export async function renameMachine(id: string, label: string): Promise<void> {
  const all = await listMachines();
  const m = all.find((x) => x.id === id);
  if (!m) return;
  m.label = label.trim() || m.id;
  await saveMachines(all);
}
