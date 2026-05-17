import { deleteSession } from "@moikapy/magic-link";
import { requireOrigin, buildCookieString } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

/** POST /api/auth/logout — end session */
export async function POST(request: Request) {
  try {
    // Enforce origin check to prevent CSRF on logout
    const originError = requireOrigin(request);
    if (originError) return originError;

    const sessionId = getSessionId(request);
    if (sessionId) {
      const { env } = await getCtx();
      await deleteSession(env.DB, sessionId);
    }

    // Clear cookie with Secure flag
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildCookieString("magic_session", "", { maxAge: 0 }),
      },
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "auth/logout");
    return Response.json({ error: message }, { status });
  }
}

function getSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/magic_session=([^;]+)/);
  return match ? match[1] : null;
}

async function getCtx() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    return getCloudflareContext();
  } catch {
    return { env: { DB: null } };
  }
}