export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  ts: number;
  level: LogLevel;
  msg: string;
};

const MAX = 200;

// Process-wide ring buffer. Survives across route invocations within the same
// server process (best-effort; reset on full reload).
type LogGlobal = { vaultSyncLog?: LogEntry[] };
const g = globalThis as unknown as LogGlobal;
function buffer(): LogEntry[] {
  if (!g.vaultSyncLog) g.vaultSyncLog = [];
  return g.vaultSyncLog;
}

export function log(level: LogLevel, msg: string): void {
  const buf = buffer();
  buf.push({ ts: Date.now(), level, msg });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  const line = `[vault-sync] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logInfo = (m: string): void => log("info", m);
export const logWarn = (m: string): void => log("warn", m);
export const logError = (m: string): void => log("error", m);

/** Most recent entries first. */
export function recentLogs(limit = 100): LogEntry[] {
  return buffer().slice(-limit).reverse();
}
