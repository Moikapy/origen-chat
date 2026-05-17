/**
 * GET /api/token/revenue — Get user's launched tokens and revenue info.
 * POST /api/token/launch — Record a token launch after on-chain confirmation.
 */

import { getSessionId, getEnv } from "@/lib/api-utils";
import { sanitizeError } from "@/lib/sanitize-error";

// ── Auth helper ────────────────────────────────────────────────

async function authenticate(request: Request): Promise<{ userId: string; env: any } | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const env = await getEnv();
  if (!(env as any).DB) return null;

  const { getSession } = await import("@moikapy/magic-link");
  const result = await getSession(sessionId, {
    db: (env as any).DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY,
  });

  if (!result?.user?.id) return null;
  return { userId: result.user.id, env };
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET /api/token/revenue ────────────────────────────────────

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;

  try {
    const result = await db
      .prepare("SELECT * FROM user_tokens WHERE user_id = ? ORDER BY launched_at DESC")
      .bind(userId)
      .all();

    return Response.json({
      tokens: result.results,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "token/revenue");
    return Response.json({ error: message }, { status });
  }
}

// ── POST /api/token/launch — Record token launch after on-chain tx ──

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;

  try {
    const body = (await request.json()) as {
      tokenAddress: string;
      tokenName: string;
      tokenSymbol: string;
      royaltyNftAddress?: string;
      revenueManagerAddress?: string;
      initialMarketCapUsdc?: number;
      creatorRevenueBps?: number;
      protocolFeeBps?: number;
      launchTxHash?: string;
      source?: string;
    };

    if (!body.tokenAddress || !body.tokenName || !body.tokenSymbol) {
      return Response.json(
        { error: "tokenAddress, tokenName, and tokenSymbol are required" },
        { status: 400 },
      );
    }

    // Check if this token is already recorded
    const existing = await db
      .prepare("SELECT token_address FROM user_tokens WHERE user_id = ? AND token_address = ?")
      .bind(userId, body.tokenAddress.toLowerCase())
      .first();

    if (existing) {
      return Response.json({ ok: true, message: "Token already recorded", duplicate: true });
    }

    // Record the token launch
    await db
      .prepare(
        `INSERT INTO user_tokens (user_id, token_address, token_name, token_symbol, royalty_nft_address, revenue_manager_address, initial_market_cap_usdc, creator_revenue_bps, protocol_fee_bps, launch_tx_hash, source, launched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        body.tokenAddress.toLowerCase(),
        body.tokenName,
        body.tokenSymbol.toUpperCase(),
        body.royaltyNftAddress?.toLowerCase() || null,
        body.revenueManagerAddress?.toLowerCase() || null,
        body.initialMarketCapUsdc || null,
        body.creatorRevenueBps || 8000,
        body.protocolFeeBps || 250,
        body.launchTxHash || null,
        body.source || "flaunch",
        Math.floor(Date.now() / 1000),
      )
      .run();

    return Response.json({
      ok: true,
      tokenAddress: body.tokenAddress,
      tokenSymbol: body.tokenSymbol,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "token/launch");
    return Response.json({ error: message }, { status });
  }
}