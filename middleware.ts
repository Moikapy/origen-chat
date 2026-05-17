import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers middleware.
 *
 * Adds defense-in-depth headers to all responses:
 * - Content-Security-Policy: Prevents XSS and injection attacks
 * - X-Frame-Options: Prevents clickjacking
 * - X-Content-Type-Options: Prevents MIME-type sniffing
 * - Referrer-Policy: Controls referrer leakage
 * - Permissions-Policy: Disables unnecessary browser features
 * - Strict-Transport-Security: Enforces HTTPS
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security Headers ──────────────────────────────────────────

  // Prevent clickjacking — our app is never embedded in iframes
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME-type sniffing — browser must respect declared Content-Type
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Control referrer leakage — only send origin to cross-site, full to same-site
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Enable browser DNS prefetching for performance
  response.headers.set("X-DNS-Prefetch-Control", "on");

  // Disable unnecessary browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  );

  // HSTS — enforce HTTPS for 1 year, include subdomains, submit to preload list
  // Cloudflare adds HSTS too, but defense in depth
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // ── Content Security Policy ────────────────────────────────────
  // Tight enough to prevent XSS, loose enough to not break the app.
  // Next.js requires 'unsafe-inline' and 'unsafe-eval' for its runtime,
  // but we restrict everything else.

  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    `default-src 'self'`,
    // Scripts: Next.js runtime needs unsafe-inline and unsafe-eval
    // In production, we could use nonces, but that requires significant refactoring
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    // Styles: Next.js injects inline styles
    `style-src 'self' 'unsafe-inline'`,
    // Images: Allow data: URIs and any https source (model providers, avatars)
    `img-src 'self' data: https: blob:`,
    // Fonts: Allow self-hosted and data: URIs
    `font-src 'self' data:`,
    // Connections: API calls, SSE, and WebSocket for dev server
    `connect-src 'self' https://openrouter.ai https://*.moikapy.dev ${isDev ? "ws://localhost:*" : ""}`,
    // Media: Allow audio/video from https sources
    `media-src 'self' https:`,
    // Objects: No Flash/Java plugins
    `object-src 'none'`,
    // Forms: Only submit to our own origin
    `form-action 'self'`,
    // Frames: Never allow embedding (redundant with X-Frame-Options, but CSP is modern)
    `frame-ancestors 'none'`,
    // Base URI: Restrict to self
    `base-uri 'self'`,
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // Run on all routes except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};