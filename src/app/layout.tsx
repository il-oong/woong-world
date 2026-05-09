import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AssistantWidget } from "@/components/AssistantWidget";
import { TopNav } from "@/components/TopNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { IosPwaPrompt } from "@/components/IosPwaPrompt";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "비서",
  description: "나만의 AI 일정 비서",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "비서",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <ServiceWorkerRegister />
        <TopNav />
        {children}
        <AssistantWidget />
        <IosPwaPrompt />
      </body>
    </html>
  );
}
