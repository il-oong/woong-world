"use client";

import { useEffect, useState, ReactNode } from "react";
import { AuthContext, isAdmin as checkAdmin, onAuthStateChanged, User } from "@/lib/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // Demo mode — no Firebase
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin: checkAdmin(user), loading }}>
      {children}
    </AuthContext.Provider>
  );
}
