"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  // Firebase 미설정 시 데모 모드 — 관리자 접근 허용
  const demoMode = !isFirebaseConfigured;

  useEffect(() => {
    if (!demoMode && !loading && !isAdmin) {
      router.push("/");
    }
  }, [loading, isAdmin, router, demoMode]);

  if (!demoMode && loading) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <div className="text-yellow-400/40 animate-pulse text-sm">인증 확인 중...</div>
      </div>
    );
  }

  if (!demoMode && !isAdmin) {
    return null;
  }

  return (
    <div className="pt-14 min-h-screen admin-theme">
      {/* Admin ambient — subtle gold tint at top */}
      <div className="fixed top-0 left-0 right-0 h-40 pointer-events-none z-0 bg-gradient-to-b from-yellow-400/[0.02] to-transparent" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}
