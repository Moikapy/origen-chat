import { sendMagicLink } from "@moikapy/magic-link";
import { requireOrigin } from "@/lib/origin-guard";

/** POST /api/auth/magic — send magic link email */
export async function POST(request: Request) {
  try {
    // Enforce origin check to prevent CSRF
    const originError = requireOrigin(request);
    if (originError) return originError;

    const body: { email?: string } = await request.json() as any;
    const email = body.email;
    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    const { env } = await getCtx();

    console.log("[auth/magic] Sending magic link to:", email.trim().toLowerCase().replace(/(.{1}).+@/, "$1***@"));
    const result = await sendMagicLink(email.trim().toLowerCase(), {
      db: env.DB,
      // Use Resend directly — Cloudflare Email Sending requires domain verification
      // and fails silently. Resend is reliable and already configured.
      resendApiKey: env.RESEND_API_KEY,
      fromEmail: env.FROM_EMAIL || process.env.FROM_EMAIL || "Origen Chat <no_reply@moikapy.dev>",
      appName: "Origen Chat",
      baseUrl: env.APP_URL || process.env.APP_URL || "https://origen-chat.moikapy.workers.dev",
      verifyPath: "/auth/verify",
    });
    console.log("[auth/magic] Result:", JSON.stringify(result));

    return Response.json(result);
  } catch (err) {
    console.error("[auth/magic] Error:", err);
    return Response.json({ error: "Failed to send magic link. Please try again." }, { status: 500 });
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