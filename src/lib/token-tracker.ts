/**
 * Token usage tracking and cost calculation.
 *
 * Tracks per-user token usage, calculates costs, and maintains monthly quotas.
 * Prices based on Gemini 2.0 Flash:
 *   - Input: $0.075 / 1M tokens
 *   - Output: $0.30 / 1M tokens
 */

const INPUT_COST_PER_M = 0.075;
const OUTPUT_COST_PER_M = 0.30;

export interface TokenUsage {
  userId: string;
  email: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  endpoint: string; // "chat" | "agent"
  estimatedCost: number;
}

export interface UserMonthlyQuota {
  userId: string;
  email: string;
  monthStarted: string; // "2026-05-01"
  monthlyTokenLimit: number;
  usedTokens: number;
  totalCost: number;
  lastAlertAt?: Date;
  lastAlertAmount?: number;
}

export interface TokenLimitConfig {
  userId: string;
  monthlyTokenLimit: number;
  lastUpdatedBy: string; // admin email
  lastUpdatedAt: Date;
}

// In-memory storage (in production, use Firestore/PostgreSQL)
const usageLog: TokenUsage[] = [];
const monthlyQuotas = new Map<string, UserMonthlyQuota>();
const tokenLimitConfigs = new Map<string, TokenLimitConfig>();

const DEFAULT_MONTHLY_TOKEN_LIMIT = 500_000; // 50만 토큰/월
const COST_ALERT_THRESHOLD = 10; // $10 알림
const COST_ALERT_INCREMENT = 10; // 10달러마다 반복 알림

/**
 * Calculate cost from tokens
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens * INPUT_COST_PER_M) / 1_000_000;
  const outputCost = (outputTokens * OUTPUT_COST_PER_M) / 1_000_000;
  return inputCost + outputCost;
}

/**
 * Log token usage and return cost
 */
export function logTokenUsage(
  userId: string,
  email: string,
  inputTokens: number,
  outputTokens: number,
  endpoint: string,
): TokenUsage {
  const cost = calculateCost(inputTokens, outputTokens);
  const usage: TokenUsage = {
    userId,
    email,
    inputTokens,
    outputTokens,
    timestamp: new Date(),
    endpoint,
    estimatedCost: cost,
  };

  usageLog.push(usage);
  updateUserQuota(userId, email, inputTokens, outputTokens, cost);

  return usage;
}

/**
 * Get the monthly token limit for a user (checks config, falls back to default)
 */
function getUserTokenLimit(userId: string): number {
  const config = tokenLimitConfigs.get(userId);
  return config?.monthlyTokenLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;
}

/**
 * Update monthly quota for user
 */
function updateUserQuota(
  userId: string,
  email: string,
  inputTokens: number,
  outputTokens: number,
  cost: number,
): void {
  const monthKey = getMonthKey();
  const key = `${userId}:${monthKey}`;

  if (!monthlyQuotas.has(key)) {
    monthlyQuotas.set(key, {
      userId,
      email,
      monthStarted: monthKey,
      monthlyTokenLimit: getUserTokenLimit(userId),
      usedTokens: 0,
      totalCost: 0,
    });
  }

  const quota = monthlyQuotas.get(key)!;
  quota.usedTokens += inputTokens + outputTokens;
  quota.totalCost += cost;
}

/**
 * Get current month key (YYYY-MM)
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get user's monthly quota
 */
export function getUserQuota(userId: string): UserMonthlyQuota | null {
  const monthKey = getMonthKey();
  const key = `${userId}:${monthKey}`;
  return monthlyQuotas.get(key) || null;
}

/**
 * Check if user exceeded quota
 */
export function isQuotaExceeded(userId: string): boolean {
  const quota = getUserQuota(userId);
  if (!quota) return false;
  return quota.usedTokens >= quota.monthlyTokenLimit;
}

/**
 * Get remaining quota
 */
export function getRemainingQuota(userId: string): number {
  const quota = getUserQuota(userId);
  if (!quota) return MONTHLY_TOKEN_LIMIT;
  return Math.max(0, quota.monthlyTokenLimit - quota.usedTokens);
}

/**
 * Check if cost exceeds alert threshold and return alert info
 */
export interface CostAlert {
  shouldAlert: boolean;
  currentCost: number;
  threshold: number;
  lastAlerted: number;
  nextAlertAt: number;
}

export function checkCostAlert(userId: string): CostAlert {
  const quota = getUserQuota(userId);
  if (!quota) {
    return {
      shouldAlert: false,
      currentCost: 0,
      threshold: COST_ALERT_THRESHOLD,
      lastAlerted: 0,
      nextAlertAt: COST_ALERT_THRESHOLD,
    };
  }

  const currentCost = quota.totalCost;
  const lastAlerted = quota.lastAlertAmount || 0;

  // 첫 10달러, 그 다음 20, 30, ... 마다 알림
  const nextThreshold = Math.ceil((lastAlerted + 1) / COST_ALERT_INCREMENT) * COST_ALERT_INCREMENT;
  const shouldAlert = currentCost >= nextThreshold && !quota.lastAlertAt;

  return {
    shouldAlert,
    currentCost,
    threshold: nextThreshold,
    lastAlerted,
    nextAlertAt: nextThreshold,
  };
}

/**
 * Mark alert as sent
 */
export function markAlertSent(userId: string): void {
  const quota = getUserQuota(userId);
  if (!quota) return;
  quota.lastAlertAt = new Date();
  quota.lastAlertAmount = quota.totalCost;
}

/**
 * Set per-user token limit
 */
export function setUserTokenLimit(userId: string, monthlyTokenLimit: number, adminEmail: string): void {
  if (monthlyTokenLimit <= 0) {
    throw new Error("Monthly token limit must be greater than 0");
  }

  tokenLimitConfigs.set(userId, {
    userId,
    monthlyTokenLimit,
    lastUpdatedBy: adminEmail,
    lastUpdatedAt: new Date(),
  });

  // Update current month quota if it exists
  const monthKey = getMonthKey();
  const key = `${userId}:${monthKey}`;
  const quota = monthlyQuotas.get(key);
  if (quota) {
    quota.monthlyTokenLimit = monthlyTokenLimit;
  }
}

/**
 * Get per-user token limit
 */
export function getUserTokenLimitConfig(userId: string): TokenLimitConfig | null {
  return tokenLimitConfigs.get(userId) || null;
}

/**
 * Reset user token limit to default
 */
export function resetUserTokenLimit(userId: string, adminEmail: string): void {
  tokenLimitConfigs.delete(userId);

  // Reset current month quota if it exists
  const monthKey = getMonthKey();
  const key = `${userId}:${monthKey}`;
  const quota = monthlyQuotas.get(key);
  if (quota) {
    quota.monthlyTokenLimit = DEFAULT_MONTHLY_TOKEN_LIMIT;
  }
}

/**
 * Get all token limit configs (admin only)
 */
export function getAllTokenLimitConfigs(): TokenLimitConfig[] {
  return Array.from(tokenLimitConfigs.values());
}

/**
 * Get usage statistics
 */
export function getUsageStats(userId?: string) {
  const monthKey = getMonthKey();
  const relevantLog = userId
    ? usageLog.filter((u) => u.userId === userId && u.timestamp.toISOString().startsWith(monthKey))
    : usageLog.filter((u) => u.timestamp.toISOString().startsWith(monthKey));

  const totalInputTokens = relevantLog.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutputTokens = relevantLog.reduce((sum, u) => sum + u.outputTokens, 0);
  const totalCost = relevantLog.reduce((sum, u) => sum + u.estimatedCost, 0);

  const byEndpoint = {
    chat: relevantLog
      .filter((u) => u.endpoint === "chat")
      .reduce((sum, u) => sum + u.estimatedCost, 0),
    agent: relevantLog
      .filter((u) => u.endpoint === "agent")
      .reduce((sum, u) => sum + u.estimatedCost, 0),
  };

  return {
    month: monthKey,
    totalRequests: relevantLog.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost,
    byEndpoint,
    costPerRequest: relevantLog.length > 0 ? totalCost / relevantLog.length : 0,
  };
}

/**
 * Export usage logs (for admin dashboard / billing)
 */
export function exportUsageLogs(userId?: string, monthKey?: string) {
  return usageLog.filter((u) => {
    const uMonth = u.timestamp.toISOString().substring(0, 7);
    return (!userId || u.userId === userId) && (!monthKey || uMonth === monthKey);
  });
}
