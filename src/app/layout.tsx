import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/shared/AuthProvider";
import NavBar from "@/components/shared/NavBar";
import CommandPalette from "@/components/shared/CommandPalette";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Woong World",
  description: "김원웅의 프로젝트 유니버스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-[#08080c] text-zinc-400">
        <AuthProvider>
          <NavBar />
          <main className="relative">{children}</main>
          <CommandPalette />
        </AuthProvider>
      </body>
    </html>
  );
}
