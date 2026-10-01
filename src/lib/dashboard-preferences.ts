import { Redis } from "@upstash/redis";
import { parseDashboardConfig, type DashboardConfig } from "./dashboard-config";

export function dashboardConfigKey(email: string): string {
  return `dashboard:config:${email.trim().toLowerCase()}`;
}

function redis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("storage_not_configured");
  return new Redis({ url, token });
}

export async function getDashboardConfig(email: string): Promise<DashboardConfig | null> {
  const stored = await redis().get<unknown>(dashboardConfigKey(email));
  return stored === null ? null : parseDashboardConfig(stored);
}

export async function saveDashboardConfig(email: string, input: unknown): Promise<DashboardConfig> {
  const config = parseDashboardConfig(input);
  await redis().set(dashboardConfigKey(email), config);
  return config;
}
