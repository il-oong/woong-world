"use client";

import { useEffect, useState, ReactNode } from "react";
import { AuthContext, isAdmin as checkAdmin, onAuthStateChanged, User } from "@/lib/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // Firebase not wired up. We do NOT flag the user as admin here —
      // the admin pages themselves decide whether to allow demo access
      // (and only in non-production).
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Resolve admin status asynchronously (SHA-256 hash comparison).
  useEffect(() => {
    let cancelled = false;
    checkAdmin(user).then((result) => {
      if (!cancelled) setAdmin(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isAdmin: admin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
