export const MEMORY_MAX_LENGTH = 8000;
export const MEMORY_FILE_MAX_BYTES = 32_000;

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
