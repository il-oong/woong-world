"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { AuthContext, isAdmin as checkAdmin, onAuthStateChanged, User } from "@/lib/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

/**
 * After Google sign-in, send the Firebase ID token to the server so it can
 * verify (firebase-admin) and set a signed httpOnly session cookie. This
 * cookie is what proxy.ts checks for /admin/* access.
 */
async function syncSession(user: User | null) {
  if (!user) {
    // Sign out — clear server session
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch { /* ignore */ }
    return;
  }

  try {
    const idToken = await user.getIdToken();
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch { /* ignore — server session is best-effort */ }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);

  const handleAuthChange = useCallback((u: User | null) => {
    setUser(u);
    setLoading(false);
    // Sync server-side session cookie in the background
    syncSession(u);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
    return unsubscribe;
  }, [handleAuthChange]);

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
