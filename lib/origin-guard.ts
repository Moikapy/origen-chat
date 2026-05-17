/**
 * Origin validation and CSRF protection utilities.
 *
 * Prevents CSRF attacks on state-changing endpoints by verifying
 * that requests originate from our own domain.
 */

/** Allowed origins for CORS/CSRF checks — production + dev */
const ALLOWED_ORIGINS = [
  "https://origen.moikapy.dev",
  "https://origen-chat.moikapy.workers.dev",
  "http://localhost:3456",
  "http://localhost:3000",
];

/**
 * Validate that a request originates from an allowed origin.
 *
 * On state-changing requests (POST, PUT, DELETE, PATCH), the Origin header
 * MUST be present and match an allowed origin. This prevents CSRF attacks
 * where a malicious site submits forms to our API.
 *
 * We also check Referer as a fallback when Origin is missing, which handles
 * older browsers and some programmatic clients.
 */
export function requireOrigin(request: Request): Response | null {
  // Only enforce on mutation methods
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");

  // If Origin header is present, it must match
  if (origin) {
    if (!ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + "/"))) {
      return Response.json({ error: "Forbidden — invalid origin" }, { status: 403 });
    }
    return null; // Origin is valid
  }

  // No Origin header — check Referer as fallback
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      if (ALLOWED_ORIGINS.some((o) => refererOrigin === o || refererOrigin.startsWith(o + "/"))) {
        return null; // Referer is valid
      }
    } catch {
      // Malformed Referer — reject
    }
  }

  // Neither Origin nor Referer — reject
  // Note: We previously allowed no-origin requests for "API calls from scripts",
  // but that opens CSRF vectors. Require at least one.
  return Response.json({ error: "Forbidden — missing origin header" }, { status: 403 });
}

/**
 * Check if a request's Origin matches an allowed origin.
 * Returns true if the request is allowed, false otherwise.
 * Unlike requireOrigin, this allows requests with no Origin (for GET/read endpoints).
 */
export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Read endpoints allow no-origin

  return ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + "/"));
}

/**
 * Determine if we're running in production (HTTPS) or dev (HTTP).
 * Used to conditionally set the Secure flag on cookies.
 */
export function isProduction(request?: Request): boolean {
  // If we have a request, check its URL
  if (request) {
    const url = new URL(request.url);
    return url.protocol === "https:";
  }
  // Fallback: check environment
  return !!process.env.OPENROUTER_ENCRYPT_KEY;
}

/**
 * Build a Set-Cookie string with appropriate flags.
 * Sets Secure flag in production, omits it for localhost dev.
 */
export function buildCookieString(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    secure?: boolean;
    path?: string;
  } = {},
): string {
  const {
    maxAge = 30 * 24 * 60 * 60, // 30 days default
    httpOnly = true,
    sameSite = "Lax",
    secure, // auto-detect if not specified
    path = "/",
  } = options;

  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ];

  if (httpOnly) parts.push("HttpOnly");
  if (secure !== false) parts.push("Secure"); // Default to Secure

  return parts.join("; ");
}