import { Redis } from "@upstash/redis";
import seed from "@/data/plugins.json";
import type { Plugin } from "./plugins";

const KEY = "plugins:registry";

// Internal-app shortcuts that used to ship in the seed registry. Filtered out
// at load time so older Redis snapshots don't keep showing them in the hub.
// (Their /apps/* routes still work; entry points moved to the home page.)
const RETIRED_INTERNAL_IDS = new Set(["routine", "subscription"]);

function withoutRetired(plugins: Plugin[]): Plugin[] {
  return plugins.filter((p) => !RETIRED_INTERNAL_IDS.has(p.id));
}

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

/**
 * Load the plugin registry. Source of truth is Redis; if the key is absent
 * (first-ever read or Redis flushed), seeds with the JSON defaults.
 *
 * An explicit empty array IS a valid persisted state — meaning the admin
 * removed every plugin. Treating that as "empty → reseed" would make
 * deletions non-persistent.
 */
export async function loadPlugins(): Promise<Plugin[]> {
  const r = redis();
  if (!r) return withoutRetired(seed as Plugin[]);
  try {
    const stored = await r.get<Plugin[]>(KEY);
    if (Array.isArray(stored)) return withoutRetired(stored);
    // Key absent — seed once with defaults.
    const defaults = seed as Plugin[];
    await r.set(KEY, defaults);
    return withoutRetired(defaults);
  } catch {
    return withoutRetired(seed as Plugin[]);
  }
}

export async function loadPlugin(id: string): Promise<Plugin | null> {
  const all = await loadPlugins();
  return all.find((p) => p.id === id) ?? null;
}

async function saveAll(plugins: Plugin[]): Promise<void> {
  const r = redis();
  if (!r) throw new Error("redis_not_configured");
  await r.set(KEY, plugins);
}

export async function addPlugin(plugin: Plugin): Promise<Plugin[]> {
  const all = await loadPlugins();
  if (all.some((p) => p.id === plugin.id)) {
    throw new Error("duplicate_id");
  }
  const next = [...all, plugin];
  await saveAll(next);
  return next;
}

export async function removePlugin(id: string): Promise<Plugin[]> {
  const all = await loadPlugins();
  if (!all.some((p) => p.id === id)) {
    throw new Error("not_found");
  }
  const next = all.filter((p) => p.id !== id);
  await saveAll(next);
  return next;
}

export async function updatePlugin(
  id: string,
  patch: Partial<Plugin>,
): Promise<Plugin[]> {
  const all = await loadPlugins();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("not_found");
  // Don't allow changing the id via patch.
  const { id: _ignored, ...rest } = patch;
  void _ignored;
  const next = [...all];
  next[idx] = { ...next[idx], ...rest };
  await saveAll(next);
  return next;
}
