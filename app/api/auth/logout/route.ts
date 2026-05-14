import { deleteSession } from "@moikapy/magic-link";

/** POST /api/auth/logout — end session */
export async function POST(request: Request) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    const { env } = await getCtx();
    await deleteSession(env.DB, sessionId);
  }

  // Clear cookie
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "magic_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
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