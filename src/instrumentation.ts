/**
 * Server-startup hook. Boots the VaultSync background engine — but only in the
 * Node.js runtime and only when running locally (never on Vercel/edge). The
 * watcher itself is additionally opt-in via VAULT_SYNC_ENABLED.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isLocalRuntime } = await import("./lib/vault-sync/config");
  if (!isLocalRuntime()) return;

  const { startWatcher } = await import("./lib/vault-sync/watcher");
  startWatcher();
}
