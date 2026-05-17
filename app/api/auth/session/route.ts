/**
 * GET /api/auth/session — Returns user session + OpenRouter connection status.
 *
 * Combines the magic-link auth status with the OpenRouter BYOK status
 * so the client knows both: who the user is AND whether they have a key.
 */
import { decryptApiKey } from "@moikapy/openrouter-auth/crypto";

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

const OR_COOKIE = "or_session";
const MAGIC_COOKIE = "magic_session";

/** Parse a specific cookie from the Cookie header */
function getCookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  // Match cookie name=value (value may contain base64url chars: A-Za-z0-9_-)
  const regex = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookies.match(regex);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  try {
    const env = await getEnv();
    const encryptKey = env.OPENROUTER_ENCRYPT_KEY;
    const sessionId = getCookieValue(request, MAGIC_COOKIE);

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

    // Check OpenRouter connection — decrypt the cookie directly
    let openrouterConnected = false;
    const orCookie = getCookieValue(request, OR_COOKIE);
    if (orCookie && encryptKey) {
      try {
        const result = await decryptApiKey(orCookie, encryptKey, {
          previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS
            ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS]
            : undefined,
        });
        openrouterConnected = !!result.apiKey;
      } catch {
        // Cookie expired, invalid, or wrong encryption key — not connected
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