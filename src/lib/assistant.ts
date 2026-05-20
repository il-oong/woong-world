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

export type ProposedAction =
  | {
      id: string;
      type: "add_event";
      status: "pending" | "approved" | "rejected";
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
      status: "pending" | "approved" | "rejected";
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
      status: "pending" | "approved" | "rejected";
      params: {
        planId: string;
        patch: UpdatePlanInput;
      };
    }
  | {
      id: string;
      type: "create_routine";
      status: "pending" | "approved" | "rejected";
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
      status: "pending" | "approved" | "rejected";
      params: {
        cmd: string;
        cwd?: string;
        explanation: string;
        /** Optional plugin id this command relates to (for traceability). */
        pluginId?: string;
      };
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

const MAX_HISTORY = 200;
const MAX_FILES = 100;

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

export async function updateActionStatus(
  email: string,
  messageId: string,
  actionId: string,
  status: "approved" | "rejected",
  paramsOverride?: Record<string, unknown>,
): Promise<{ message: ChatMessage; action: ProposedAction } | null> {
  const all = await loadChat(email);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) return null;
  const msg = all[idx];
  if (!msg.proposedActions) return null;
  const action = msg.proposedActions.find((a) => a.id === actionId);
  if (!action) return null;
  action.status = status;
  if (paramsOverride !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (action as any).params = paramsOverride;
  }
  all[idx] = { ...msg };
  await redis().set(chatKey(email), all);
  return { message: msg, action };
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
