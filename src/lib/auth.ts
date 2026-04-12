"use client";

import { createContext, useContext } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Admin identification.
 *
 * We compare the signed-in user's email against a SHA-256 hash stored in
 * `NEXT_PUBLIC_ADMIN_EMAIL_SHA256`. The hash still ends up in the client
 * bundle, but unlike a plaintext email it can't be scraped into a phishing
 * list — an attacker has to brute-force candidate emails against the hash.
 *
 * This is a defense-in-depth measure ONLY. Server routes must not trust it;
 * they should verify a Firebase ID token with firebase-admin.
 */
const ADMIN_EMAIL_SHA256 = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_SHA256 ?? ""
).toLowerCase();

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isAdmin(user: User | null): Promise<boolean> {
  if (!user?.email || !ADMIN_EMAIL_SHA256) return false;
  try {
    const hash = await sha256Hex(user.email.trim().toLowerCase());
    return hash === ADMIN_EMAIL_SHA256;
  } catch {
    return false;
  }
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase not configured");
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signOut() {
  if (!auth) throw new Error("Firebase not configured");
  return firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

// Auth context type
export interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  isAdmin: false,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}
