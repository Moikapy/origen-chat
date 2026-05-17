import { verifyMagicToken } from "@moikapy/magic-link";
import { sanitizeError } from "@/lib/sanitize-error";
import { buildCookieString } from "@/lib/origin-guard";

const APP_URL = "https://origen.moikapy.dev";

/** GET /api/auth/verify?token=xxx — verify magic link token, set session cookie */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const { env } = await getCtx();

  const result = await verifyMagicToken(token, {
    db: env.DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY || "",
    baseUrl: env.APP_URL || APP_URL,
  });

  if (!result.ok) {
    // Sanitize verification errors — don't leak internal token details
    const safeMessage = result.error === "invalid_token" ? "Invalid or expired verification link."
      : result.error === "expired_token" ? "Verification link has expired. Please request a new one."
      : "Verification failed.";
    return new Response(JSON.stringify({ ok: false, error: safeMessage }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Set session cookie and redirect home
  const headers = new Headers();
  headers.set("Location", (env.APP_URL || APP_URL) + "/chat");
  headers.set("Set-Cookie", buildCookieString("magic_session", String(result.sessionId ?? ""), { maxAge: 30 * 24 * 60 * 60 }));
  return new Response(null, { status: 302, headers });
}

async function getCtx() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    return getCloudflareContext();
  } catch {
    return { env: { DB: null, OPENROUTER_ENCRYPT_KEY: "", APP_URL: "http://localhost:3456" } };
  }
}