import type { NextConfig } from "next";

// Security headers applied to every route. Keep CSP connect-src in sync with
// the external APIs the app talks to (Gemini, GitHub, Google Fonts, Firebase).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      // Next.js / framer-motion need inline styles; scripts inline are required for hydration payload
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://avatars.githubusercontent.com",
      [
        "connect-src 'self'",
        "https://generativelanguage.googleapis.com",
        "https://api.github.com",
        "https://*.googleapis.com",
        "https://*.firebaseio.com",
        "https://*.firebaseapp.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
      ].join(" "),
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Hide the "X-Powered-By: Next.js" fingerprint
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
