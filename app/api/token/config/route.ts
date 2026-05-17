/**
 * GET /api/token/config — Returns Flaunch configuration for the client.
 *
 * Provides the RevenueManager instance address, treasury wallet,
 * and USDC contract address needed for token launches and payments.
 */
import { USDC_BASE_CONTRACT } from "@/lib/crypto-payments";

async function getEnv() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare" as string);
    const { env } = await getCloudflareContext();
    return env as Record<string, string | undefined>;
  } catch {
    return {
      TREASURY_WALLET: process.env.TREASURY_WALLET,
      BASE_RPC_URL: process.env.BASE_RPC_URL,
      REVENUE_MANAGER_ADDRESS: process.env.REVENUE_MANAGER_ADDRESS,
    };
  }
}

export async function GET() {
  const env = await getEnv();

  return Response.json({
    treasuryAddress: env.TREASURY_WALLET || null,
    usdcContract: USDC_BASE_CONTRACT,
    baseRpcUrl: env.BASE_RPC_URL || "https://mainnet.base.org",
    revenueManagerAddress: env.REVENUE_MANAGER_ADDRESS || null,
    protocolFeePercent: 2.5,
    chain: {
      name: "Base",
      chainId: 8453,
      explorer: "https://basescan.org",
    },
  });
}