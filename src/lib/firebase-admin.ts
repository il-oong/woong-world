/**
 * Firebase Admin SDK — server-side only.
 *
 * Required env vars (set in Vercel / deployment platform):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY     (PEM, with literal \n — Vercel auto-handles)
 *   ADMIN_EMAIL              (plaintext admin email — server-only, NOT NEXT_PUBLIC_)
 *
 * If any are missing, admin SDK is disabled and server-side auth falls back
 * to the client-only guard (not recommended for production).
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

function init(): { app: App; auth: Auth } | null {
  if (adminApp && adminAuth) return { app: adminApp, auth: adminAuth };

  if (getApps().length > 0) {
    adminApp = getApps()[0];
    adminAuth = getAuth(adminApp);
    return { app: adminApp, auth: adminAuth };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    adminApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    adminAuth = getAuth(adminApp);
    return { app: adminApp, auth: adminAuth };
  } catch (e) {
    console.error("firebase-admin init failed:", e);
    return null;
  }
}

/**
 * Verify a Firebase ID token returned by `user.getIdToken()`.
 * Returns the decoded token on success, null otherwise.
 */
export async function verifyIdToken(idToken: string) {
  const admin = init();
  if (!admin) return null;
  try {
    return await admin.auth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

/** Check if the given email is the authorized admin. */
export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = process.env.ADMIN_EMAIL;
  if (!allowed) return false;
  return email.trim().toLowerCase() === allowed.trim().toLowerCase();
}
