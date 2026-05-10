import { Redis } from "@upstash/redis";
import seed from "@/data/plugins.json";
import type { Plugin } from "./plugins";

const KEY = "plugins:registry";

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
 * Load the plugin registry. Source of truth is Redis; if Redis is empty
 * (or unavailable), falls back to the static JSON seed and lazily seeds Redis.
 */
export async function loadPlugins(): Promise<Plugin[]> {
  const r = redis();
  if (!r) return seed as Plugin[];
  try {
    const stored = await r.get<Plugin[]>(KEY);
    if (Array.isArray(stored) && stored.length > 0) return stored;
    // Seed once with defaults.
    const defaults = seed as Plugin[];
    await r.set(KEY, defaults);
    return defaults;
  } catch {
    return seed as Plugin[];
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
