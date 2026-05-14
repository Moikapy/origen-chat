import { verifyMagicToken } from "@moikapy/magic-link";

const APP_URL = "https://origen-chat.moikapy.workers.dev";

/** GET /api/auth/verify?token=xxx — verify magic link token, set session cookie */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const { env } = await getCtx();

  const result = await verifyMagicToken(token, {
    db: env.DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY,
    baseUrl: env.APP_URL || APP_URL,
  });

  if (!result.ok) {
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Set session cookie and redirect home
  const headers = new Headers();
  headers.set("Location", (env.APP_URL || APP_URL) + "/chat");
  headers.set("Set-Cookie", `magic_session=${result.sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
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