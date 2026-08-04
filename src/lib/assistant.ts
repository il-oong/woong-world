import { Redis } from "@upstash/redis";
import type { CategoryId } from "./categories";
import type { PlanPeriod, UpdatePlanInput } from "./plans";

export type ChatRole = "user" | "assistant";

export type FileKind =
  | "text"
  | "markdown"
  | "json"
  | "url"
  | "pdf"
  | "docx"
  | "image";

export type ActionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "failed";

/** Safe, approval-only controls for the user's connected workspace apps. */
export type WorkspaceOperation =
  | { operation: "add_todo"; text: string; scope: "day" | "week" | "month" }
  | { operation: "update_todo"; id: string; patch: { text?: string; done?: boolean; scope?: "day" | "week" | "month" } }
  | { operation: "remove_todo"; id: string }
  | { operation: "add_subscription"; name: string; amount: number; paymentDay: number; cycle: "monthly" | "yearly"; monthOfYear?: number }
  | { operation: "remove_subscription"; id: string }
  | { operation: "add_watch_item"; ticker: string; name: string; market: "KR" | "US"; memo?: string }
  | { operation: "remove_watch_item"; id: string }
  | { operation: "sync_vault" }
  | { operation: "create_vault_backup" };

export type ProposedAction =
  | {
      id: string;
      type: "add_event";
      status: ActionStatus;
      params: {
        summary: string;
        description?: string;
        kind: "timed" | "allday" | "project";
        start: string;
        end: string;
        categoryId?: CategoryId;
        reminderMinutes?: number | null;
      };
    }
  | {
      id: string;
      type: "create_plan";
      status: ActionStatus;
      params: {
        period: PlanPeriod;
        periodKey: string;
        title: string;
        items?: { text: string }[];
        categoryId?: CategoryId | null;
        notes?: string;
      };
    }
  | {
      id: string;
      type: "update_plan";
      status: ActionStatus;
      params: {
        planId: string;
        patch: UpdatePlanInput;
      };
    }
  | {
      id: string;
      type: "create_routine";
      status: ActionStatus;
      params: {
        name: string;
        weekdays?: number[]; // 0=Sun,1=Mon,...,6=Sat. empty = every day
      };
    }
  | {
      id: string;
      // Suggest a shell command for the user to run locally — not executed by the server.
      // The UI offers a copy button and an explanation.
      type: "suggest_command";
      status: ActionStatus;
      params: {
        cmd: string;
        cwd?: string;
        explanation: string;
        /** Optional plugin id this command relates to (for traceability). */
        pluginId?: string;
      };
    }
  | {
      id: string;
      type: "manage_workspace";
      status: ActionStatus;
      params: WorkspaceOperation;
    };

export type ChatAttachment = {
  fileId: string;
  name: string;
  kind: FileKind;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  attachments?: ChatAttachment[];
  proposedActions?: ProposedAction[];
  ts: number;
};

export type UploadedFile = {
  id: string;
  name: string;
  kind: FileKind;
  blobUrl?: string;
  textContent?: string;
  url?: string;
  mimeType?: string;
  bytes: number;
  createdAt: number;
};

export type AssistantActionAudit = {
  id: string;
  messageId: string;
  actionId: string;
  actionType: ProposedAction["type"];
  status: Exclude<ActionStatus, "pending">;
  params: ProposedAction["params"];
  at: number;
  error?: string;
};

const MAX_HISTORY = 200;
const MAX_FILES = 100;
const MAX_ACTION_AUDIT = 200;

function getRedisCreds(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isAssistantStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) {
    throw new Error(
      "Redis credentials not set (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN)",
    );
  }
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

const chatKey = (email: string) => `chat:${email.toLowerCase()}`;
const filesKey = (email: string) => `files:${email.toLowerCase()}`;
const actionAuditKey = (email: string) => `assistant-action-audit:${email.toLowerCase()}`;
const actionLockKey = (email: string, messageId: string, actionId: string) =>
  `assistant-action-lock:${email.toLowerCase()}:${messageId}:${actionId}`;
const rateLimitKey = (email: string, bucket: string) =>
  `assistant-rate:${bucket}:${email.toLowerCase()}`;

// ---- Chat history ----

export async function loadChat(email: string): Promise<ChatMessage[]> {
  const data = await redis().get<ChatMessage[]>(chatKey(email));
  return Array.isArray(data) ? data : [];
}

export async function appendChat(
  email: string,
  ...messages: ChatMessage[]
): Promise<ChatMessage[]> {
  const all = await loadChat(email);
  const next = [...all, ...messages];
  // Keep only the most recent N messages
  const capped = next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
  await redis().set(chatKey(email), capped);
  return capped;
}

export async function clearChat(email: string): Promise<void> {
  await redis().del(chatKey(email));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 2_000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function optionalText(value: unknown, max = 5_000): string | undefined | null {
  if (value === undefined) return undefined;
  return text(value, max);
}

function optionalCategoryId(value: unknown): CategoryId | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return text(value, 100);
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    /^\d{4}-\d{2}-\d{2}(?:(?:T|\s).+)?$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isId(value: unknown, prefix?: string): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 120) {
    return false;
  }
  return prefix ? value.startsWith(prefix) : /^[a-zA-Z0-9_-]+$/.test(value);
}

function parsePlanPatch(value: unknown): UpdatePlanInput | null {
  if (!isRecord(value)) return null;
  const allowed = new Set(["title", "categoryId", "items", "notes"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const patch: UpdatePlanInput = {};

  if (value.title !== undefined) {
    const title = text(value.title, 300);
    if (!title) return null;
    patch.title = title;
  }
  if (value.categoryId !== undefined) {
    const categoryId = optionalCategoryId(value.categoryId);
    if (categoryId === undefined) return null;
    patch.categoryId = categoryId;
  }
  if (value.notes !== undefined) {
    const notes = typeof value.notes === "string" && value.notes.length <= 10_000
      ? value.notes.trim()
      : null;
    if (notes === null) return null;
    patch.notes = notes;
  }
  if (value.items !== undefined) {
    if (!Array.isArray(value.items) || value.items.length > 100) return null;
    const items = value.items.map((item) => {
      if (!isRecord(item) || !isId(item.id, "it_") || typeof item.done !== "boolean") {
        return null;
      }
      const itemText = text(item.text, 500);
      return itemText ? { id: item.id, text: itemText, done: item.done } : null;
    });
    if (items.some((item) => item === null)) return null;
    patch.items = items as NonNullable<UpdatePlanInput["items"]>;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function isSafeCommandSuggestion(command: string): boolean {
  if (command.includes("\n") || command.includes("\r")) return false;
  return !/(?:\brm\s+-rf\b|\bdel\s+\/|\brmdir\b|\bformat\b|\bshutdown\b|\breboot\b|git\s+push\s+--force|git\s+reset\s+--hard|\bdrop\s+(?:database|table)\b)/i.test(
    command,
  );
}

function parseWorkspaceOperation(value: Record<string, unknown>): WorkspaceOperation | null {
  const operation = value.operation;
  if (operation === "add_todo") {
    const todoText = text(value.text, 500);
    const scope = value.scope;
    if (!todoText || (scope !== "day" && scope !== "week" && scope !== "month")) return null;
    return { operation, text: todoText, scope };
  }
  if (operation === "update_todo") {
    if (!isId(value.id, "td_") || !isRecord(value.patch)) return null;
    const patch: { text?: string; done?: boolean; scope?: "day" | "week" | "month" } = {};
    if (value.patch.text !== undefined) {
      const todoText = text(value.patch.text, 500);
      if (!todoText) return null;
      patch.text = todoText;
    }
    if (value.patch.done !== undefined) {
      if (typeof value.patch.done !== "boolean") return null;
      patch.done = value.patch.done;
    }
    if (value.patch.scope !== undefined) {
      if (!["day", "week", "month"].includes(String(value.patch.scope))) return null;
      patch.scope = value.patch.scope as "day" | "week" | "month";
    }
    return Object.keys(patch).length ? { operation, id: value.id, patch } : null;
  }
  if (operation === "remove_todo") {
    return isId(value.id, "td_") ? { operation, id: value.id } : null;
  }
  if (operation === "add_subscription") {
    const name = text(value.name, 200);
    const amount = value.amount;
    const paymentDay = value.paymentDay;
    const cycle = value.cycle;
    const monthOfYear = value.monthOfYear;
    if (
      !name ||
      typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000 ||
      typeof paymentDay !== "number" || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31 ||
      (cycle !== "monthly" && cycle !== "yearly") ||
      (monthOfYear !== undefined && (typeof monthOfYear !== "number" || !Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12)) ||
      (cycle === "yearly" && monthOfYear === undefined)
    ) {
      return null;
    }
    return { operation, name, amount, paymentDay, cycle, monthOfYear: monthOfYear as number | undefined };
  }
  if (operation === "remove_subscription") {
    return isId(value.id, "sub_") ? { operation, id: value.id } : null;
  }
  if (operation === "add_watch_item") {
    const ticker = text(value.ticker, 40);
    const name = text(value.name, 200);
    const memo = optionalText(value.memo, 1_000);
    if (!ticker || !name || memo === null || (value.market !== "KR" && value.market !== "US")) return null;
    return { operation, ticker: ticker.toUpperCase(), name, market: value.market, memo: memo ?? undefined };
  }
  if (operation === "remove_watch_item") {
    return isId(value.id, "a_") ? { operation, id: value.id } : null;
  }
  if (operation === "sync_vault" || operation === "create_vault_backup") {
    return Object.keys(value).length === 1 ? { operation } : null;
  }
  return null;
}

/**
 * Treat model output and browser overrides as untrusted input. A proposed
 * action may only cross the approval boundary after this exact shape check.
 */
export function validateActionParams(
  type: ProposedAction["type"],
  value: unknown,
): ProposedAction["params"] | null {
  if (!isRecord(value)) return null;

  if (type === "add_event") {
    const summary = text(value.summary, 300);
    const description = optionalText(value.description, 10_000);
    const categoryRaw = value.categoryId;
    const categoryId = categoryRaw === undefined ? undefined : text(categoryRaw, 100);
    const reminder = value.reminderMinutes;
    const reminderMinutes =
      reminder === undefined
        ? undefined
        : reminder === null
          ? null
          : typeof reminder === "number" && Number.isInteger(reminder) && reminder >= 0 && reminder <= 10_080
            ? reminder
            : undefined;
    if (
      !summary ||
      description === null ||
      (categoryRaw !== undefined && !categoryId) ||
      !["timed", "allday", "project"].includes(String(value.kind)) ||
      !isIsoDate(value.start) ||
      !isIsoDate(value.end) ||
      (reminder !== undefined && reminderMinutes === undefined)
    ) {
      return null;
    }
    if (Date.parse(value.end) < Date.parse(value.start)) return null;
    return {
      summary,
      description: description ?? undefined,
      kind: value.kind as "timed" | "allday" | "project",
      start: value.start,
      end: value.end,
      categoryId: categoryId ?? undefined,
      reminderMinutes,
    };
  }

  if (type === "create_plan") {
    const title = text(value.title, 300);
    const categoryRaw = value.categoryId;
    const categoryId = optionalCategoryId(categoryRaw);
    const notes = optionalText(value.notes, 10_000);
    const periodKey = text(value.periodKey, 30);
    const itemsRaw = value.items;
    const items =
      itemsRaw === undefined
        ? undefined
        : Array.isArray(itemsRaw) && itemsRaw.length <= 100
          ? itemsRaw.map((item) => (isRecord(item) ? text(item.text, 500) : null))
          : null;
    if (
      !title ||
      !periodKey ||
      !["weekly", "monthly", "yearly"].includes(String(value.period)) ||
      (categoryRaw !== undefined && categoryId === undefined) ||
      notes === null ||
      items === null ||
      (items !== undefined && items.some((item) => item === null))
    ) {
      return null;
    }
    return {
      period: value.period as PlanPeriod,
      periodKey,
      title,
      items: items?.map((item) => ({ text: item! })),
      categoryId,
      notes,
    };
  }

  if (type === "update_plan") {
    if (!isId(value.planId, "pl_")) return null;
    const patch = parsePlanPatch(value.patch);
    return patch ? { planId: value.planId, patch } : null;
  }

  if (type === "create_routine") {
    const name = text(value.name, 200);
    const weekdays = value.weekdays;
    if (
      !name ||
      (weekdays !== undefined &&
        (!Array.isArray(weekdays) ||
          weekdays.length > 7 ||
          weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
          new Set(weekdays).size !== weekdays.length))
    ) {
      return null;
    }
    return { name, weekdays: weekdays as number[] | undefined };
  }

  if (type === "manage_workspace") {
    return parseWorkspaceOperation(value);
  }

  const cmd = text(value.cmd, 1_000);
  const explanation = text(value.explanation, 2_000);
  const cwd = optionalText(value.cwd, 300);
  const pluginId = optionalText(value.pluginId, 100);
  if (!cmd || !explanation || cwd === null || pluginId === null || !isSafeCommandSuggestion(cmd)) {
    return null;
  }
  return { cmd, cwd, explanation, pluginId };
}

export function parseProposedAction(value: unknown): ProposedAction | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (
    type !== "add_event" &&
    type !== "create_plan" &&
    type !== "update_plan" &&
    type !== "create_routine" &&
    type !== "manage_workspace" &&
    type !== "suggest_command"
  ) {
    return null;
  }
  const params = validateActionParams(type, value.params);
  if (!params) return null;
  return { id: newId("act"), type, status: "pending", params } as ProposedAction;
}

type ActionClaim =
  | { state: "claimed"; action: ProposedAction }
  | { state: "not_found" | "not_pending" | "invalid_params" | "busy" };

export async function claimAssistantAction(
  email: string,
  messageId: string,
  actionId: string,
  paramsOverride?: unknown,
): Promise<ActionClaim> {
  const lockKey = actionLockKey(email, messageId, actionId);
  const locked = await redis().set(lockKey, "1", { nx: true, ex: 120 });
  if (!locked) return { state: "busy" };

  const all = await loadChat(email);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) {
    await redis().del(lockKey);
    return { state: "not_found" };
  }
  const msg = all[idx];
  if (!msg.proposedActions) {
    await redis().del(lockKey);
    return { state: "not_found" };
  }
  const action = msg.proposedActions.find((a) => a.id === actionId);
  if (!action) {
    await redis().del(lockKey);
    return { state: "not_found" };
  }
  if (action.status !== "pending") {
    await redis().del(lockKey);
    return { state: "not_pending" };
  }
  const params = validateActionParams(
    action.type,
    paramsOverride === undefined ? action.params : paramsOverride,
  );
  if (!params) {
    await redis().del(lockKey);
    return { state: "invalid_params" };
  }
  return { state: "claimed", action: { ...action, params } as ProposedAction };
}

export async function finishAssistantAction(
  email: string,
  messageId: string,
  actionId: string,
  status: Exclude<ActionStatus, "pending">,
  params: ProposedAction["params"],
): Promise<ProposedAction | null> {
  const all = await loadChat(email);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1 || !all[idx].proposedActions) return null;
  const message = all[idx];
  const actionIndex = message.proposedActions!.findIndex((a) => a.id === actionId);
  if (actionIndex === -1) return null;
  const previous = message.proposedActions![actionIndex];
  const action = { ...previous, status, params } as ProposedAction;
  const proposedActions = [...message.proposedActions!];
  proposedActions[actionIndex] = action;
  all[idx] = { ...message, proposedActions };
  await redis().set(chatKey(email), all);
  await redis().del(actionLockKey(email, messageId, actionId));
  return action;
}

export async function appendAssistantActionAudit(
  email: string,
  audit: Omit<AssistantActionAudit, "id" | "at">,
): Promise<void> {
  const existing = await redis().get<AssistantActionAudit[]>(actionAuditKey(email));
  const entry: AssistantActionAudit = {
    ...audit,
    id: newId("audit"),
    at: Date.now(),
  };
  const next = [entry, ...(Array.isArray(existing) ? existing : [])].slice(
    0,
    MAX_ACTION_AUDIT,
  );
  await redis().set(actionAuditKey(email), next);
}

/** Simple per-user server-side budget for expensive model requests. */
export async function consumeUserRateLimit(
  email: string,
  bucket: "assistant-chat" | "stock-analysis",
  limit: number,
  windowSeconds = 60,
): Promise<boolean> {
  const key = rateLimitKey(email, bucket);
  const count = await redis().incr(key);
  if (count === 1) await redis().expire(key, windowSeconds);
  return count <= limit;
}

// ---- Uploaded files ----

export async function listFiles(email: string): Promise<UploadedFile[]> {
  const data = await redis().get<UploadedFile[]>(filesKey(email));
  return Array.isArray(data) ? data : [];
}

export async function addFile(
  email: string,
  file: UploadedFile,
): Promise<UploadedFile[]> {
  const all = await listFiles(email);
  const next = [file, ...all];
  const capped = next.length > MAX_FILES ? next.slice(0, MAX_FILES) : next;
  await redis().set(filesKey(email), capped);
  return capped;
}

export async function removeFile(
  email: string,
  fileId: string,
): Promise<UploadedFile | null> {
  const all = await listFiles(email);
  const file = all.find((f) => f.id === fileId);
  if (!file) return null;
  const next = all.filter((f) => f.id !== fileId);
  await redis().set(filesKey(email), next);
  return file;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
