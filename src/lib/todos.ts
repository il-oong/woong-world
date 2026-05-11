import { Redis } from "@upstash/redis";

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
};

function getRedisCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function isTodoStorageConfigured(): boolean {
  return getRedisCreds() !== null;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (_redis) return _redis;
  const creds = getRedisCreds();
  if (!creds) throw new Error("Redis credentials not set");
  _redis = new Redis({ url: creds.url, token: creds.token });
  return _redis;
}

const listKey = (email: string) => `todos:${email.toLowerCase()}`;

const MAX_ITEMS = 200;

export async function listTodos(email: string): Promise<Todo[]> {
  const data = await redis().get<Todo[]>(listKey(email));
  if (!Array.isArray(data)) return [];
  // open items first (sorted by createdAt asc), done items last (by doneAt desc).
  const open = data.filter((t) => !t.done).sort((a, b) => a.createdAt - b.createdAt);
  const done = data
    .filter((t) => t.done)
    .sort((a, b) => (b.doneAt ?? b.createdAt) - (a.doneAt ?? a.createdAt));
  return [...open, ...done];
}

export async function addTodo(email: string, text: string): Promise<Todo> {
  const all = await listTodos(email);
  if (all.length >= MAX_ITEMS) {
    throw new Error("limit_exceeded");
  }
  const todo: Todo = {
    id: `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    done: false,
    createdAt: Date.now(),
  };
  await redis().set(listKey(email), [...all, todo]);
  return todo;
}

export async function updateTodo(
  email: string,
  id: string,
  patch: { text?: string; done?: boolean },
): Promise<Todo | null> {
  const all = await listTodos(email);
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const prev = all[idx];
  const next: Todo = {
    ...prev,
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.done !== undefined
      ? {
          done: patch.done,
          doneAt: patch.done ? Date.now() : undefined,
        }
      : {}),
  };
  all[idx] = next;
  await redis().set(listKey(email), all);
  return next;
}

export async function removeTodo(email: string, id: string): Promise<boolean> {
  const all = await listTodos(email);
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  await redis().set(listKey(email), next);
  return true;
}

export type TodoStats = { open: number; done: number; total: number };

export function statsOf(todos: Todo[]): TodoStats {
  const open = todos.filter((t) => !t.done).length;
  const done = todos.length - open;
  return { open, done, total: todos.length };
}
