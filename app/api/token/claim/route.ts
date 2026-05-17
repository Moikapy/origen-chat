/**
 * GET /api/token/claim — Get claimable ETH balances from RevenueManager for user's tokens.
 * POST /api/token/claim — Record a claim + convert ETH to Origen credits.
 *
 * The actual on-chain claim() call happens client-side via MetaMask.
 * This endpoint handles balance checking and credit conversion after claim.
 */

import { getSessionId, getEnv } from "@/lib/api-utils";
import { sanitizeError } from "@/lib/sanitize-error";
import { getOrCreateSubscription, grantCredits } from "@/lib/credits";
import { USDC_BASE_CONTRACT } from "@/lib/crypto-payments";

// RevenueManager ABI — only the functions we need
const REVENUE_MANAGER_ABI = [
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_recipient", type: "address" }],
    outputs: [{ name: "balance_", type: "uint256" }],
  },
  {
    name: "tokens",
    type: "function",
    inputs: [{ name: "_creator", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "flaunch", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "creator", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

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

/** Call RevenueManager.balances() via Base RPC to check claimable ETH */
async function getClaimableBalance(revenueManagerAddress: string, recipientAddress: string, rpcUrl: string): Promise<bigint> {
  // Encode the balances(address) call
  const selector = "0x074c31e6"; // keccak256("balances(address)") first 4 bytes
  const paddedAddress = recipientAddress.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = selector + paddedAddress;

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_call", params: [{ to: revenueManagerAddress, data }, "latest"], id: 1 }),
  });
  const result = await response.json() as any;
  if (result.error) throw new Error(`RPC error: ${result.error.message}`);

  const balanceHex = result.result as string;
  if (!balanceHex || balanceHex === "0x") return 0n;
  return BigInt(balanceHex);
}

// ── GET: Check claimable balances ────────────────────────────

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;

  try {
    // Get user's wallet address
    const wallet = await db.prepare("SELECT wallet_address FROM user_wallets WHERE user_id = ? AND is_primary = 1").bind(userId).first() as { wallet_address: string } | null;
    if (!wallet) return Response.json({ tokens: [], totalClaimableEth: "0", walletConnected: false });

    const revenueManagerAddress = env.REVENUE_MANAGER_ADDRESS;
    if (!revenueManagerAddress) return Response.json({ tokens: [], totalClaimableEth: "0", revenueManagerConfigured: false });

    const rpcUrl = env.BASE_RPC_URL || "https://mainnet.base.org";

    // Get user's tokens
    const tokensResult = await db.prepare("SELECT * FROM user_tokens WHERE user_id = ? ORDER BY launched_at DESC").bind(userId).all();

    // Check claimable balance for each token
    let totalClaimableWei = 0n;
    const tokensWithBalance = await Promise.all(
      (tokensResult.results as any[]).map(async (token) => {
        try {
          // The sender address is the token creator (user's wallet)
          // RevenueManager tracks balances per recipient
          const balance = await getClaimableBalance(revenueManagerAddress, wallet.wallet_address, rpcUrl);
          totalClaimableWei += balance;
          return {
            ...token,
            claimableWei: balance.toString(),
            claimableEth: formatEth(balance),
          };
        } catch {
          return { ...token, claimableWei: "0", claimableEth: "0" };
        }
      }),
    );

    return Response.json({
      tokens: tokensWithBalance,
      totalClaimableEth: formatEth(totalClaimableWei),
      totalClaimableWei: totalClaimableWei.toString(),
      walletAddress: wallet.wallet_address,
      revenueManagerAddress,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "token/claim");
    return Response.json({ error: message }, { status });
  }
}

// ── POST: Record a claim and convert ETH to credits ──────────

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  const { userId, env } = auth;
  const db = (env as any).DB as D1Database;

  try {
    const body = (await request.json()) as {
      txHash: string;
      amountWei: string;
      convertToCredits?: boolean;
    };

    if (!body.txHash) return Response.json({ error: "txHash is required" }, { status: 400 });

    const amountWei = BigInt(body.amountWei || "0");
    if (amountWei <= 0n) return Response.json({ error: "Amount must be positive" }, { status: 400 });

    // Convert ETH to credits
    // Formula: ETH amount → USD value → cents → credits (minus 3% spread)
    // We use a rough ETH price or let the user specify
    const convertToCredits = body.convertToCredits !== false;

    let creditsGranted = 0;
    let ethPriceUsd = 0;

    if (convertToCredits) {
      // Fetch current ETH price
      ethPriceUsd = await getEthPrice();
      const ethAmount = Number(amountWei) / 1e18;
      const usdCents = Math.floor(ethAmount * ethPriceUsd * 100);
      creditsGranted = Math.floor(usdCents * (1 - 0.03)); // 3% platform spread

      if (creditsGranted > 0) {
        await grantCredits(db, userId, creditsGranted, "purchase", `ETH revenue claim → credits (≈${formatEth(amountWei)} ETH)`);
      }
    }

    // Record the claim in D1
    await db.prepare(
      "INSERT INTO crypto_topups (id, user_id, type, chain, tx_hash, amount_eth, credits_granted, status, completed_at, created_at) VALUES (?, ?, 'claim', 'base', ?, ?, ?, 'completed', ?, ?)"
    ).bind(
      crypto.randomUUID(),
      userId,
      body.txHash,
      formatEth(amountWei),
      creditsGranted,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000),
    ).run();

    const sub = await getOrCreateSubscription(db, userId);

    return Response.json({
      ok: true,
      amountEth: formatEth(amountWei),
      ethPriceUsd,
      creditsGranted,
      plan: sub.plan,
      creditsBalance: sub.creditsBalance,
      converted: convertToCredits,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "token/claim");
    return Response.json({ error: message }, { status });
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function formatEth(wei: bigint): string {
  const whole = Number(wei / 10n ** 12n) / 1e6;
  return whole.toFixed(6);
}

/** Get current ETH price in USD from public API */
async function getEthPrice(): Promise<number> {
  try {
    const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      headers: { "Accept": "application/json" },
      cf: { cacheEverything: true, cacheTtl: 300 }, // Cache 5 min on Cloudflare
    } as any);
    const data = await resp.json() as any;
    return data?.ethereum?.usd || 2500; // Fallback $2500
  } catch {
    return 2500; // Fallback if API fails
  }
}