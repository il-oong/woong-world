import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AssistantWidget } from "@/components/AssistantWidget";
import { TopNav } from "@/components/TopNav";
import { SwRegistrar } from "@/components/SwRegistrar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Woong Hub",
  description: "내가 만든 모든 도구와 서비스를 한 곳에",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Woong Hub",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#09090d" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <TopNav />
        {children}
        <AssistantWidget />
        <SwRegistrar />
      </body>
    </html>
  );
}
