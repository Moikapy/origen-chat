import { sendMagicLink } from "@moikapy/magic-link";
import { requireOrigin } from "@/lib/origin-guard";
import { createMimeMessage } from "mimetext";

/** Cloudflare Workers EmailMessage — available at runtime in Cloudflare Workers */
declare const EmailMessage: {
  new (from: string, to: string, rawMime: string): unknown;
};

/**
 * Wrap Cloudflare's send_email binding to work with @moikapy/magic-link.
 *
 * The package calls `sendEmail.send({ to: [...], from, subject, html, text })`
 * but Cloudflare's send_email binding expects `env.SEB.send(new EmailMessage(from, to, rawMIME))`.
 *
 * This adapter converts the plain-object call into a proper EmailMessage.
 */
function wrapCloudflareEmail(
  seb: { send: (msg: unknown) => Promise<{ messageId?: string }> },
): { send: (msg: { to: string[]; from: string; subject: string; html: string; text: string }) => Promise<{ messageId?: string }> } {
  return {
    async send(msg) {
      const mime = createMimeMessage();
      mime.setSender(msg.from);
      mime.setRecipient(msg.to[0]);
      mime.setSubject(msg.subject);
      mime.addMessage({ contentType: "text/html", data: msg.html });
      mime.addMessage({ contentType: "text/plain", data: msg.text });

      const message = new EmailMessage(msg.from, msg.to[0], mime.asRaw());
      const result = await seb.send(message);
      return { messageId: result?.messageId };
    },
  };
}

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
    const normalizedEmail = email.trim().toLowerCase();

    console.log("[auth/magic] Sending magic link to:", normalizedEmail.replace(/(.{1}).+@/, "$1***@"));

    // Wrap the SEB binding to convert the package's plain-object format
    // into Cloudflare's EmailMessage format
    const sendEmailBinding = env.SEB ? wrapCloudflareEmail(env.SEB as any) : undefined;

    const result = await sendMagicLink(normalizedEmail, {
      db: env.DB,
      // Cloudflare Email Sending adapter — free 100 emails/day
      sendEmail: sendEmailBinding as any,
      // Fallback: Resend API (set as wrangler secret)
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Failed to send magic link: ${message}` }, { status: 500 });
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