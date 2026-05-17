import { sendMagicLink } from "@moikapy/magic-link";

/** Check that the request comes from our own origin */
function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowedOrigins = [
    "https://origen-chat.moikapy.workers.dev",
    "http://localhost:3456",
  ];
  if (origin && allowedOrigins.some((o) => origin.startsWith(o))) return true;
  if (referer && allowedOrigins.some((o) => referer.startsWith(o))) return true;
  return false;
}

/** POST /api/auth/magic — send magic link email */
export async function POST(request: Request) {
  try {
    if (!validateOrigin(request)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: { email?: string } = await request.json() as any;
    const email = body.email;
    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    const { env } = await getCtx();

    const result = await sendMagicLink(email.trim().toLowerCase(), {
      db: env.DB,
      // Cloudflare Email Sending binding — free 3K emails/month
      sendEmail: env.SEB,
      // Fallback: Resend (set as wrangler secret)
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL || process.env.FROM_EMAIL || "Origen Chat <no_reply@moikapy.dev>",
      appName: "Origen Chat",
      baseUrl: env.APP_URL || process.env.APP_URL || "https://origen-chat.moikapy.workers.dev",
      verifyPath: "/auth/verify",
    });

    return Response.json(result);
  } catch (err) {
    console.error("[auth/magic] Error:", err);
    const message = err instanceof Error ? err.message : "Failed to send email";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function getCtx() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return { env };
  } catch {
    return { env: { DB: null, SEB: null, RESEND_API_KEY: "", APP_URL: "http://localhost:3456" } };
  }
}