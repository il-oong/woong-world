import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const icons = [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any" as const,
    },
    {
      src: "/icon-maskable.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable" as const,
    },
  ];

  return {
    name: "비서",
    short_name: "비서",
    description: "나만의 AI 일정 비서",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    orientation: "portrait",
    categories: ["productivity"],
    icons,
    // Android: long-press the installed app icon to jump to these pages.
    // (Real OS home-screen widgets aren't possible from a PWA — requires
    // native iOS WidgetKit / Android AppWidgetProvider. These shortcuts are
    // the closest equivalent.)
    shortcuts: [
      {
        name: "오늘 일정",
        short_name: "오늘",
        description: "오늘의 일정을 확인합니다.",
        url: "/calendar",
        icons,
      },
      {
        name: "할 일",
        short_name: "할 일",
        description: "체크박스 할 일 목록을 엽니다.",
        url: "/apps/todo",
        icons,
      },
      {
        name: "브리핑 생성",
        short_name: "브리핑",
        description: "오늘의 음성 브리핑을 생성합니다.",
        url: "/?briefing=1",
        icons,
      },
    ],
  };
}
