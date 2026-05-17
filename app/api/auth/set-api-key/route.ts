/**
 * POST /api/auth/set-api-key — Manually set an OpenRouter API key.
 *
 * Encrypts the key with AES-256-GCM and stores it in an httpOnly cookie.
 * Used when the user pastes their key directly instead of OAuth.
 */
import { encryptApiKey } from "@moikapy/openrouter-auth";
import { requireOrigin, buildCookieString } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

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

const COOKIE_NAME = "or_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function POST(request: Request) {
  try {
    // Enforce origin check to prevent CSRF
    const originError = requireOrigin(request);
    if (originError) return originError;

    const body = (await request.json()) as { apiKey?: string };
    const apiKey = body.apiKey?.trim();

    if (!apiKey) {
      return Response.json({ error: "API key is required" }, { status: 400 });
    }

    // Validate it looks like an OpenRouter key
    if (!apiKey.startsWith("sk-or-v1-") && !apiKey.startsWith("sk-or-")) {
      return Response.json(
        { error: "Invalid key format. OpenRouter keys start with sk-or-" },
        { status: 400 },
      );
    }

    const env = await getEnv();
    const encryptKey = env.OPENROUTER_ENCRYPT_KEY;
    if (!encryptKey) {
      return Response.json({ error: "Server not configured for key storage" }, { status: 500 });
    }

    // Encrypt the API key
    const encrypted = await encryptApiKey(apiKey, encryptKey, {
      previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS
        ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS]
        : undefined,
      sessionMaxAge: COOKIE_MAX_AGE,
    });

    // Set the cookie with Secure flag (Cloudflare terminates TLS, so browser connection is always HTTPS)
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      buildCookieString(COOKIE_NAME, encrypted, { maxAge: COOKIE_MAX_AGE }),
    );

    return new Response(JSON.stringify({ ok: true, connected: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "auth/set-api-key");
    return Response.json({ error: message }, { status });
  }
}