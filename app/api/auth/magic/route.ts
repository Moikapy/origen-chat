/** Basic email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Mask email for logging: m***@gmail.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local[0]}***@${domain}`;
}
import { requireOrigin } from "@/lib/origin-guard";
import { createMimeMessage } from "mimetext";

/** Cloudflare Workers EmailMessage — available at runtime in Cloudflare Workers */
declare const EmailMessage: {
  new (from: string, to: string, rawMime: string): unknown;
};

// Re-implement the token logic locally so we control email sending
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST /api/auth/magic — send magic link email */
export async function POST(request: Request) {
  try {
    const originError = requireOrigin(request);
    if (originError) return originError;

    const body: { email?: string } = await request.json() as any;
    const email = body.email;
    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized)) {
      // Rate-limit invalid emails
      await new Promise((r) => setTimeout(r, Math.random() * 200 + 150));
      return Response.json({ ok: true, email: maskEmail(normalized || "invalid") });
    }

    const { env } = await getCtx();
    const fromEmail = env.FROM_EMAIL || process.env.FROM_EMAIL || "Origen Chat <no_reply@moikapy.dev>";
    const baseUrl = env.APP_URL || process.env.APP_URL || "https://origen-chat.moikapy.workers.dev";

    console.log("[auth/magic] Sending magic link to:", normalized.replace(/(.{1}).+@/, "$1***@"));

    // Generate token and store in DB
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 min

    await env.DB.prepare(
      "INSERT INTO magic_tokens (email, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, unixepoch())"
    ).bind(normalized, tokenHash, expiresAt).run();

    // Ensure user exists
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(normalized).first();
    if (!existing) {
      await env.DB.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(crypto.randomUUID(), normalized).run();
    }

    // Build magic link URL
    const magicUrl = `${baseUrl}/auth/verify?token=${token}`;

    // Render email content
    const subject = "Sign in to Origen Chat";
    const text = [
      `Sign in to Origen Chat`,
      ``,
      `Click the link below to sign in. This link expires in 15 minutes.`,
      ``,
      magicUrl,
      ``,
      `If you didn't request this, you can safely ignore this email.`,
      ``,
      `\u2014 The Origen Chat team`,
    ].join("\n");
    const html = [
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">`,
      `  <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 24px;">Sign in to Origen Chat</h1>`,
      `  <p style="font-size: 16px; line-height: 24px; color: #374151;">`,
      `    Click the button below to sign in. This link expires in <strong>15 minutes</strong>.`,
      `  </p>`,
      `  <a href="${magicUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0;">`,
      `    Sign in`,
      `  </a>`,
      `  <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">`,
      `    Or copy this link: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${magicUrl}</code>`,
      `  </p>`,
      `  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">`,
      `  <p style="font-size: 13px; color: #9ca3af;">`,
      `    If you didn't request this, you can safely ignore this email.`,
      `  </p>`,
      `</div>`,
    ].join("\n");

    // Try Cloudflare Email Sending first, fall back to Resend
    let emailSent = false;
    let emailError: string | null = null;

    if (env.SEB) {
      try {
        const mime = createMimeMessage();
        mime.setSender(fromEmail);
        mime.setRecipient(normalized);
        mime.setSubject(subject);
        mime.addMessage({ contentType: "text/html", data: html });
        mime.addMessage({ contentType: "text/plain", data: text });

        const message = new EmailMessage(fromEmail, normalized, mime.asRaw());
        await (env.SEB as any).send(message);
        emailSent = true;
        console.log("[auth/magic] Sent via Cloudflare Email Sending");
      } catch (sebErr) {
        emailError = sebErr instanceof Error ? sebErr.message : String(sebErr);
        console.warn("[auth/magic] Cloudflare Email Sending failed:", emailError);
      }
    }

    if (!emailSent && env.RESEND_API_KEY) {
      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [normalized],
            subject,
            html,
            text,
          }),
        });
        if (!resendResponse.ok) {
          const errorText = await resendResponse.text();
          throw new Error(`Resend API error (${resendResponse.status}): ${errorText}`);
        }
        emailSent = true;
        console.log("[auth/magic] Sent via Resend");
      } catch (resendErr) {
        emailError = resendErr instanceof Error ? resendErr.message : String(resendErr);
        console.error("[auth/magic] Resend also failed:", emailError);
      }
    }

    if (!emailSent) {
      console.error("[auth/magic] All email providers failed:", emailError);
      // Don't reveal whether the email exists — just return a generic error
      return Response.json({ error: "Failed to send email. Please try again later." }, { status: 500 });
    }

    return Response.json({ ok: true, email: maskEmail(normalized) });
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