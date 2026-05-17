/**
 * OpenRouter OAuth PKCE exchange endpoint.
 *
 * Receives the authorization code from the callback page,
 * exchanges it for an API key via OpenRouter, encrypts it,
 * and sets it as a cookie.
 *
 * Uses @moikapy/openrouter-auth for encryption and PKCE verification.
 */
import { exchangeCodeAndSetCookie } from "@moikapy/openrouter-auth/next";
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

/** POST /auth/exchange — Exchange OAuth code for encrypted API key cookie */
export async function POST(request: Request) {
  try {
    // Enforce origin check to prevent CSRF on code exchange
    const originError = requireOrigin(request);
    if (originError) return originError;

    const body = (await request.json()) as { code?: string; code_verifier?: string };
    const { code, code_verifier } = body;

    if (!code) {
      return Response.json({ error: "Missing authorization code" }, { status: 400 });
    }

    const env = await getEnv();
    const encryptKey = env.OPENROUTER_ENCRYPT_KEY;
    if (!encryptKey) {
      return Response.json({ error: "Server not configured for auth" }, { status: 500 });
    }

    // If code_verifier was sent from the client (PKCE), use it.
    // Otherwise, fall back to a simple code exchange (non-PKCE).
    const config = {
      encryptKey,
      previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS
        ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS]
        : undefined,
    };

    // exchangeCodeAndSetCookie handles:
    // 1. Exchanging the code for an API key
    // 2. Encrypting the key with AES-256-GCM
    // 3. Setting the encrypted cookie
    await exchangeCodeAndSetCookie(code, code_verifier ?? "", config);

    return Response.json({ ok: true, connected: true });
  } catch (err) {
    const { message, status } = sanitizeError(err, "auth/exchange");
    return Response.json({ error: message }, { status });
  }
}

/** DELETE /auth/exchange — Disconnect OpenRouter (clear cookie) */
export async function DELETE(request: Request) {
  try {
    // Enforce origin check to prevent CSRF on disconnect
    const originError = requireOrigin(request);
    if (originError) return originError;

    // Clear both cookies with Secure flag
    const headers = new Headers();
    headers.append("Set-Cookie", buildCookieString("or_session", "", { maxAge: 0 }));
    headers.append("Set-Cookie", buildCookieString("or_ollama_session", "", { maxAge: 0 }));
    return new Response(JSON.stringify({ ok: true, disconnected: true }), {
      status: 200,
      headers,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "auth/exchange/disconnect");
    return Response.json({ error: message }, { status });
  }
}