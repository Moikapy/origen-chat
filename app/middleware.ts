import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Known routes that should not be redirected
const KNOWN_ROUTES = new Set([
  "/", "/chat", "/settings",
  "/auth/login", "/auth/verify", "/auth/callback",
  "/api/auth/magic", "/api/auth/session", "/api/auth/logout", "/api/auth/verify",
  "/api/chat", "/auth/exchange",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all API routes, static assets, and _next paths
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Allow known routes
  if (KNOWN_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  // Redirect unknown routes to home
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  // Match all routes except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)"],
};