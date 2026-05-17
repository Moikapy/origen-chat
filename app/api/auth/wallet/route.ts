/**
 * POST /api/auth/wallet — Sign-In with Ethereum (SIWE) wallet authentication.
 *
 * Verifies a SIWE message + signature, then:
 * - If wallet is linked to an existing user: log them in
 * - If wallet is new: create a new user account
 *
 * Returns a session cookie (magic_session) and user info.
 */

import { verifySiweMessage, generateSiweNonce, linkWalletToUser } from "@/lib/wallet";
import { requireOrigin } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

async function getEnv() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return env as Record<string, string | undefined>;
  } catch {
    return {
      OPENROUTER_ENCRYPT_KEY: process.env.OPENROUTER_ENCRYPT_KEY,
      APP_URL: process.env.APP_URL,
    };
  }
}

const APP_URL = "https://origen.moikapy.dev";

export async function POST(request: Request) {
  try {
    const originError = requireOrigin(request);
    if (originError) return originError;

    const body = (await request.json()) as {
      message?: string;
      signature?: string;
    };

    const { message, signature } = body;

    if (!message || !signature) {
      return Response.json(
        { error: "message and signature are required" },
        { status: 400 },
      );
    }

    const env = await getEnv();
    const appUrl = env.APP_URL || APP_URL;

    // Verify the SIWE message
    const walletInfo = await verifySiweMessage(message, signature, new URL(appUrl).hostname);

    if (!walletInfo) {
      return Response.json(
        { error: "Invalid signature or message" },
        { status: 401 },
      );
    }

    const db = (env as Record<string, unknown>).DB as D1Database | undefined;
    if (!db) {
      return Response.json({ error: "Database unavailable" }, { status: 503 });
    }

    const walletAddress = walletInfo.address.toLowerCase();
    const chainId = walletInfo.chainId;

    // Check if wallet is already linked to a user
    const existingAuth = await db
      .prepare("SELECT user_id FROM user_auth_methods WHERE auth_type = 'wallet_siwe' AND auth_identifier = ?")
      .bind(walletAddress)
      .first() as { user_id: string } | null;

    let userId: string;

    if (existingAuth) {
      // Wallet already linked — log them in
      userId = existingAuth.user_id;
    } else {
      // New wallet — create a user account
      userId = crypto.randomUUID();

      await db.batch([
        db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(userId, `${walletAddress.slice(0, 8)}@wallet.base`),
        db.prepare(
          "INSERT INTO user_auth_methods (id, user_id, auth_type, auth_identifier, chain_id, verified_at) VALUES (?, ?, 'wallet_siwe', ?, ?, ?)"
        ).bind(crypto.randomUUID(), userId, walletAddress, chainId, Math.floor(Date.now() / 1000)),
        db.prepare(
          "INSERT INTO user_wallets (user_id, chain, wallet_address, wallet_type, is_primary, connected_at) VALUES (?, 'base', ?, 'metamask', 1, ?)"
        ).bind(userId, walletAddress, Math.floor(Date.now() / 1000)),
      ]);
    }

    // Create a session row in the sessions table
    const sessionId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    await db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    ).bind(sessionId, userId, expiresAt, Math.floor(Date.now() / 1000)).run();

    // Set session cookie
    const headers = new Headers();
    const { buildCookieString } = await import("@/lib/origin-guard");
    headers.append(
      "Set-Cookie",
      buildCookieString("magic_session", sessionId, { maxAge: 30 * 24 * 60 * 60 }),
    );

    return Response.json(
      { ok: true, userId, walletAddress, chainId, isNewUser: !existingAuth },
      { status: 200, headers },
    );
  } catch (err) {
    const { message, status } = sanitizeError(err, "auth/wallet");
    return Response.json({ error: message }, { status });
  }
}

/**
 * GET /api/auth/wallet/nonce — Generate a SIWE nonce for wallet login.
 */
export async function GET() {
  const nonce = generateSiweNonce();
  return Response.json({ nonce });
}