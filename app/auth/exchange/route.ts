import { exchangeCodeAndSetCookie } from "@moikapy/openrouter-auth/next";

/** POST /auth/exchange — exchange OpenRouter OAuth code for API key */
export async function POST(request: Request) {
  const body = await request.json() as { code?: string };
  const code = body.code;
  if (!code || typeof code !== "string") {
    return Response.json({ error: "Code required" }, { status: 400 });
  }

  // Read the code_verifier from cookie (set by the login page before redirect)
  const cookieHeader = request.headers.get("cookie") || "";
  const verifierMatch = cookieHeader.match(/openrouter_verifier=([^;]+)/);
  const verifier = verifierMatch ? decodeURIComponent(verifierMatch[1]) : "";

  if (!verifier) {
    return Response.json({ error: "Missing verifier — try logging in again" }, { status: 400 });
  }

  try {
    const { env } = await getCtx();
    await exchangeCodeAndSetCookie(code, verifier, {
      encryptKey: env.OPENROUTER_ENCRYPT_KEY,
      previousKeys: env.OPENROUTER_ENCRYPT_KEY_PREVIOUS ? [env.OPENROUTER_ENCRYPT_KEY_PREVIOUS] : undefined,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Exchange failed" }, { status: 500 });
  }
}

async function getCtx() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return { env };
  } catch {
    return { env: { OPENROUTER_ENCRYPT_KEY: "", OPENROUTER_ENCRYPT_KEY_PREVIOUS: "" } };
  }
}