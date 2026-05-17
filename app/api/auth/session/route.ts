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

/** Get OpenRouter account info from the user's API key */
async function getOpenRouterInfo(apiKey: string): Promise<{ balance: number; usage: number; usageMonthly: number; usageDaily: number; label: string } | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: { label?: string; usage?: number; usage_monthly?: number; usage_daily?: number; limit_remaining?: number } };
    return {
      balance: data.data?.limit_remaining ?? 0,
      usage: data.data?.usage ?? 0,
      usageMonthly: data.data?.usage_monthly ?? 0,
      usageDaily: data.data?.usage_daily ?? 0,
      label: data.data?.label ?? "",
    };
  } catch {
    return null;
  }
}

/** Parse a specific cookie from the Cookie header */
function getCookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
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

    // Check OpenRouter connection
    // Strategy: Check if the or_session cookie exists and is non-empty.
    // Try to decrypt it with the encrypt key if available.
    // If decryption fails, the cookie is still present so we know
    // the user connected (just can't read the key server-side yet).
    let openrouterConnected = false;
    let openrouterInfo: { balance: number; usage: number; usageMonthly: number; label: string } | null = null;
    const orCookie = getCookieValue(request, OR_COOKIE);
    if (orCookie) {
      // Cookie exists — user connected. Try to verify it's valid.
      if (encryptKey) {
        try {
          const result = await decryptApiKey(orCookie, encryptKey, {
            previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS
              ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS]
              : undefined,
          });
          openrouterConnected = !!result.apiKey;
          // If we have the decrypted key, fetch account info
          if (result.apiKey) {
            openrouterInfo = await getOpenRouterInfo(result.apiKey);
          }
        } catch {
          // Decryption failed (key mismatch, expired, etc.)
          // But the cookie EXISTS, so treat as connected —
          // the chat route will try to decrypt again with its own key resolution
          openrouterConnected = true;
        }
      } else {
        // No encrypt key available, but cookie exists
        openrouterConnected = true;
      }
    }

    return Response.json({
      user,
      openrouterConnected,
      openrouter: openrouterInfo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session check failed";
    console.error("[auth/session] Error:", message);
    return Response.json({ user: null, openrouterConnected: false }, { status: 200 });
  }
}