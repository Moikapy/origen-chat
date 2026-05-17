/**
 * GET /api/auth/session — Returns user session + OpenRouter connection status.
 *
 * Combines the magic-link auth status with the OpenRouter BYOK status
 * so the client knows both: who the user is AND whether they have a key.
 */
import { getApiKeyFromCookie } from "@moikapy/openrouter-auth/next";

async function getEnv() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return env as Record<string, string | undefined>;
  } catch {
    return {
      OPENROUTER_ENCRYPT_KEY: process.env.OPENROUTER_ENCRYPT_KEY,
      OPENROUTER_ENCRYPT_KEY_PREVIOUS: process.env.OPENROUTER_ENCRYPT_KEY_PREVIOUS,
    };
  }
}

/** Get session ID from magic_session cookie */
function getSessionId(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(/magic_session=([^;]+)/);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const encryptKey = env.OPENROUTER_ENCRYPT_KEY;
    const sessionId = getSessionId(request);

    // Check magic-link auth
    let user: { id: string; email: string } | null = null;
    if (sessionId && encryptKey) {
      try {
        const { getSession } = await import("@moikapy/magic-link");
        const result = await getSession(sessionId, {
          db: (env as any).DB,
          encryptKey,
        });
        if (result?.user) {
          user = { id: result.user.id, email: result.user.email };
        }
      } catch {
        // Not authenticated — that's fine
      }
    }

    // Check OpenRouter connection
    let openrouterConnected = false;
    if (encryptKey) {
      try {
        const apiKey = await getApiKeyFromCookie({
          encryptKey,
          previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS
            ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS]
            : undefined,
        });
        openrouterConnected = !!apiKey;
      } catch {
        // No valid cookie — not connected
      }
    }

    return Response.json({
      user,
      openrouterConnected,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session check failed";
    console.error("[auth/session] Error:", message);
    return Response.json({ user: null, openrouterConnected: false }, { status: 200 });
  }
}