// Shared (non-client) so the server page can validate ?tab= — a function
// exported from a "use client" module can't be called on the server.
export const TAB_IDS = ["home", "routine", "todo", "memo", "goal", "finance", "analytics"] as const;

export type Tab = (typeof TAB_IDS)[number];

export function isTab(value: string): value is Tab {
  return (TAB_IDS as readonly string[]).includes(value);
}
