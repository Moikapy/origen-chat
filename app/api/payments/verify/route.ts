/**
 * POST /api/payments/verify — Verify an on-chain USDC payment and grant credits/Pro.
 * GET /api/payments/verify — Check payment status and get treasury info.
 */
import { verifyUsdcPayment, usdToCredits, PRO_PRICE_CENTS, USDC_BASE_CONTRACT } from "@/lib/crypto-payments";
import { getSessionId, getEnv } from "@/lib/api-utils";
import { requireOrigin } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";
import { getOrCreateSubscription, grantCredits } from "@/lib/credits";

async function authenticate(request: Request): Promise<{ userId: string; env: any } | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;
  const env = await getEnv();
  if (!(env as any).DB) return null;
  const { getSession } = await import("@moikapy/magic-link");
  const result = await getSession(sessionId, { db: (env as any).DB, encryptKey: env.OPENROUTER_ENCRYPT_KEY });
  if (!result?.user?.id) return null;
  return { userId: result.user.id, env };
}

function unauthorized() { return Response.json({ error: "Unauthorized" }, { status: 401 }); }

export async function POST(request: Request) {
  const originError = requireOrigin(request);
  if (originError) return originError;
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;
  const body = (await request.json()) as { txHash?: string; type?: "subscription" | "top_up" };
  if (!body.txHash) return Response.json({ error: "txHash is required" }, { status: 400 });

  const type = body.type || "subscription";
  const treasuryAddress = env.TREASURY_WALLET;
  if (!treasuryAddress) return Response.json({ error: "Treasury wallet not configured" }, { status: 500 });

  const rpcUrl = env.BASE_RPC_URL || "https://mainnet.base.org";
  const verification = await verifyUsdcPayment(body.txHash, treasuryAddress, rpcUrl, {
    minimumAmount: type === "subscription" ? BigInt(PRO_PRICE_CENTS) * 10_000n : 1_000_000n,
  });

  if (!verification.verified) return Response.json({ error: verification.reason || "Payment verification failed" }, { status: 400 });

  const existing = await db.prepare("SELECT id FROM crypto_topups WHERE tx_hash = ?").bind(body.txHash).first();
  if (existing) return Response.json({ ok: true, message: "Payment already processed", duplicate: true });

  const amountUsdCents = verification.amountUsdCents || 0;
  const creditsGranted = usdToCredits(amountUsdCents);

  if (type === "subscription" && amountUsdCents >= PRO_PRICE_CENTS) {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE user_subscriptions SET plan = 'pro', credits_balance = credits_balance + ?, credits_monthly = 2000, current_period_start = ?, current_period_end = ?, updated_at = ? WHERE user_id = ?")
      .bind(creditsGranted, now, now + 30 * 24 * 3600, now, userId).run();
  } else {
    await grantCredits(db, userId, creditsGranted, "purchase", "USDC payment top-up");
  }

  await db.prepare("INSERT INTO crypto_topups (id, user_id, type, chain, tx_hash, amount_usd_cents, credits_granted, status, completed_at, created_at) VALUES (?, ?, ?, 'base', ?, ?, ?, 'completed', ?, ?)")
    .bind(crypto.randomUUID(), userId, type, body.txHash, amountUsdCents, creditsGranted, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();

  const sub = await getOrCreateSubscription(db, userId);
  return Response.json({ ok: true, type, amountUsdCents, creditsGranted, plan: sub.plan, creditsBalance: sub.creditsBalance });
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();
  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;
  const payments = await db.prepare("SELECT * FROM crypto_topups WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").bind(userId).all();
  return Response.json({ payments: payments.results, treasuryAddress: env.TREASURY_WALLET || null, usdcContract: USDC_BASE_CONTRACT, proPriceUsdCents: PRO_PRICE_CENTS });
}