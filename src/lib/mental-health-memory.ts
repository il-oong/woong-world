export const MEMORY_MAX_LENGTH = 2000;
export const MEMORY_FILE_MAX_BYTES = 700_000;

export function parseMemoryText(text: string): string {
  const memory = text.replace(/^\uFEFF/, "").trim();
  if (!memory) throw new Error("empty_memory");
  if (memory.length > MEMORY_MAX_LENGTH) throw new Error("memory_too_long");
  return memory;
}
export function combineMemory(
  current: string,
  incoming: string,
  replace = false,
) {
  const memory = parseMemoryText(incoming);
  if (replace || !current.trim()) return memory;
  if (current.trim() === memory || current.trim().endsWith("\n\n" + memory))
    return current.trim();
  return parseMemoryText(current.trim() + "\n\n" + memory);
}

export const RELATIONSHIP_MAX_LENGTH = 50_000;
export const RELATIONSHIP_FILE_MAX_BYTES = 700_000;
// Sent to the AI: all of it when short, otherwise the opening (background) and the most recent part.
export const RELATIONSHIP_AI_MAX = 30_000;
export function relationshipForAi(text: string): string {
  const t = text.trim();
  if (t.length <= RELATIONSHIP_AI_MAX) return t;
  const head = 6_000;
  return `${t.slice(0, head)}\n…(중간 생략)…\n${t.slice(-(RELATIONSHIP_AI_MAX - head))}`;
}
