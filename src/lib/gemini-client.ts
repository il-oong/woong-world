/**
 * Gemini API client with key rotation + rate limiting.
 * Adapted from echo_agents.py pattern.
 */

const GEMINI_KEYS: string[] = [];

// Load keys from env (GEMINI_KEY_1 ~ GEMINI_KEY_7) or single key
function loadKeys() {
  if (GEMINI_KEYS.length > 0) return;

  const single = process.env.GEMINI_API_KEY;
  if (single) GEMINI_KEYS.push(single);

  for (let i = 1; i <= 7; i++) {
    const key = process.env[`GEMINI_KEY_${i}`];
    if (key) GEMINI_KEYS.push(key);
  }
}

let currentKeyIndex = 0;
const keyCooldowns: Map<number, number> = new Map();

function getNextKey(): string | null {
  loadKeys();
  if (GEMINI_KEYS.length === 0) return null;

  const now = Date.now();

  // Try each key
  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % GEMINI_KEYS.length;
    const cooldownUntil = keyCooldowns.get(idx) || 0;

    if (now >= cooldownUntil) {
      currentKeyIndex = (idx + 1) % GEMINI_KEYS.length;
      return GEMINI_KEYS[idx];
    }
  }

  return null; // All keys on cooldown
}

function cooldownKey(keyIndex: number) {
  keyCooldowns.set(keyIndex, Date.now() + 70_000); // 70s cooldown
}

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export async function chatWithGemini(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
): Promise<string> {
  const key = getNextKey();
  if (!key) {
    throw new Error("NO_API_KEY");
  }

  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1024,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    // Rate limited — cooldown this key
    const idx = GEMINI_KEYS.indexOf(key);
    if (idx >= 0) cooldownKey(idx);
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEMINI_ERROR: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) {
    throw new Error("EMPTY_RESPONSE");
  }

  return reply;
}
