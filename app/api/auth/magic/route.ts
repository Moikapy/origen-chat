import { sendMagicLink, validateOrigin } from "@moikapy/magic-link";

/** POST /api/auth/magic — send magic link email */
export async function POST(request: Request) {
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
    fromEmail: "Origen Chat <no_reply@moikapy.dev>",
    appName: "Origen Chat",
    baseUrl: env.APP_URL || "https://origen-chat.moikapy.workers.dev",
    verifyPath: "/auth/verify",
  });

  return Response.json(result);
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