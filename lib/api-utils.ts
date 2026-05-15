/**
 * Shared utilities for API routes.
 */

/** Extract session ID from request cookies */
export function getSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/magic_session=([^;]+)/);
  return match ? match[1] : null;
}

/** Get Cloudflare env bindings (DB, etc.) */
export async function getEnv(): Promise<any> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    return getCloudflareContext().env;
  } catch {
    return { DB: null, OPENROUTER_ENCRYPT_KEY: "" };
  }
}