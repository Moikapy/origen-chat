import { getSession } from "@moikapy/magic-link";

/** GET /api/auth/session — check if user is logged in */
export async function GET(request: Request) {
  const sessionId = getSessionId(request);
  if (!sessionId) {
    return Response.json({ user: null });
  }

  const { env } = await getCtx();
  const result = await getSession(sessionId, {
    db: env.DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY,
  });

  return Response.json(result);
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
    return { env: { DB: null, OPENROUTER_ENCRYPT_KEY: "" } };
  }
}