import type { VoiceId } from "./secretary";

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export function isTtsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_TTS_API_KEY);
}

export async function synthesize(text: string, voiceId: VoiceId): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_TTS_API_KEY not set");

  const res = await fetch(`${TTS_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ko-KR", name: voiceId },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.05,
        pitch: 0.0,
        effectsProfileId: ["headphone-class-device"],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("TTS 빈 응답");

  return Buffer.from(data.audioContent, "base64");
}
