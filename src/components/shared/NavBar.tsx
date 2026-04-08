"use client";

import Link from "next/link";
import { useAuth, signInWithGoogle, signOut } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const { user, isAdmin, loading } = useAuth();
  const pathname = usePathname();
  const demoMode = !isFirebaseConfigured;
  const showAdmin = isAdmin || demoMode;

  // Hide on project dive pages — they have their own nav
  if (pathname.startsWith("/project/")) return null;

  const isAdminPage = pathname.startsWith("/admin");

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 mix-blend-difference">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo — raw text, no decoration */}
        <Link href="/" className="link-grow text-sm tracking-[0.3em] uppercase text-white/60 hover:text-white/90 transition-colors">
          Woong
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-8">
          {showAdmin && !isAdminPage && (
            <Link href="/admin" className="link-grow text-[11px] tracking-[0.2em] uppercase text-white/30 hover:text-white/70 transition-colors">
              System
            </Link>
          )}

          {showAdmin && isAdminPage && (
            <>
              {[
                { href: "/admin", label: "Overview" },
                { href: "/admin/crew", label: "Crew" },
                { href: "/admin/plans", label: "Plans" },
                { href: "/admin/workspace", label: "Dev" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`link-grow text-[11px] tracking-[0.15em] uppercase transition-colors ${
                    pathname === item.href ? "text-white/80" : "text-white/25 hover:text-white/60"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}

          {!loading && !demoMode && (
            <button
              onClick={() => user ? signOut() : signInWithGoogle()}
              className="text-[11px] tracking-[0.15em] uppercase text-white/20 hover:text-white/50 transition-colors"
            >
              {user ? "Out" : "In"}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
