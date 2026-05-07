import { NextResponse } from "next/server";

type EnvStatus = {
  key: string;
  label: string;
  group: string;
  set: boolean;
  required: boolean;
};

export async function GET() {
  const check = (key: string) => !!process.env[key];

  const items: EnvStatus[] = [
    { key: "SESSION_SECRET",            label: "세션 암호화 키",            group: "필수",    set: check("SESSION_SECRET"),            required: true },
    { key: "GOOGLE_CLIENT_ID",          label: "Google Client ID",          group: "캘린더",  set: check("GOOGLE_CLIENT_ID"),          required: false },
    { key: "GOOGLE_CLIENT_SECRET",      label: "Google Client Secret",      group: "캘린더",  set: check("GOOGLE_CLIENT_SECRET"),      required: false },
    { key: "GOOGLE_REDIRECT_URI",       label: "Google Redirect URI",       group: "캘린더",  set: check("GOOGLE_REDIRECT_URI"),       required: false },
    { key: "UPSTASH_REDIS_REST_URL",    label: "Upstash Redis URL",         group: "Redis",   set: check("UPSTASH_REDIS_REST_URL"),    required: false },
    { key: "UPSTASH_REDIS_REST_TOKEN",  label: "Upstash Redis Token",       group: "Redis",   set: check("UPSTASH_REDIS_REST_TOKEN"),  required: false },
    { key: "GEMINI_API_KEY",            label: "Gemini API Key",            group: "AI",      set: check("GEMINI_API_KEY"),            required: false },
    { key: "GITHUB_TOKEN",              label: "GitHub Token",              group: "허브",    set: check("GITHUB_TOKEN"),              required: false },
    { key: "BLOB_READ_WRITE_TOKEN",     label: "Vercel Blob Token",         group: "파일",    set: check("BLOB_READ_WRITE_TOKEN"),     required: false },
    { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", label: "VAPID Public Key",       group: "푸시",    set: check("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), required: false },
    { key: "VAPID_PRIVATE_KEY",         label: "VAPID Private Key",         group: "푸시",    set: check("VAPID_PRIVATE_KEY"),         required: false },
    { key: "APTHOME_API_KEY",           label: "청약홈 API Key",            group: "청약",    set: check("APTHOME_API_KEY"),           required: false },
    { key: "CRON_SECRET",               label: "Cron Secret",               group: "청약",    set: check("CRON_SECRET"),               required: false },
  ];

  return NextResponse.json({ items });
}
