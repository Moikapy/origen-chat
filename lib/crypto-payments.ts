/**
 * Crypto payment verification for Origen Chat.
 *
 * Verifies USDC-on-Base payments and converts USD values to Origen credits.
 * Designed to run in Cloudflare Workers with read-only Base RPC calls.
 */

// ── Constants ──────────────────────────────────────────────────

/** USDC contract on Base mainnet */
export const USDC_BASE_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Treasury wallet (configured via env var) */
export const TREASURY_ENV_VAR = "TREASURY_WALLET";

/** Base mainnet RPC */
export const BASE_RPC_MAINNET = "https://mainnet.base.org";
export const BASE_RPC_SEPOLIA = "https://sepolia.base.org";

/** 1 credit = $0.01 (1 cent) */
export const CREDITS_PER_DOLLAR = 100;

/** 3% platform spread covers gas + conversion costs */
export const PLATFORM_SPREAD = 0.03;

/** Pro subscription price in USD cents */
export const PRO_PRICE_CENTS = 500; // $5.00

/** Minimum USDC payment (6 decimals) — $1.00 */
export const MINIMUM_USDC_PAYMENT = 1_000_000n; // $1.00 in USDC (6 decimals)

// ── USDC Transfer Event ABI ────────────────────────────────────

// ERC-20 Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ── Types ──────────────────────────────────────────────────────

export interface PaymentVerificationResult {
  verified: boolean;
  reason?: string;
  from?: string;
  amountUsdc?: bigint;
  amountUsdCents?: number;
  txHash?: string;
  blockNumber?: number;
}

export interface PaymentVerificationOptions {
  /** Override the expected USDC amount (in USDC 6-decimal units) */
  amountUsdc?: bigint;
  /** Minimum amount to accept (defaults to MINIMUM_USDC_PAYMENT) */
  minimumAmount?: bigint;
  /** Maximum block age in seconds (default: 1 hour) */
  maxBlockAge?: number;
}

// ── Credit Conversion ───────────────────────────────────────────

/**
 * Convert USD cents to Origen credits, applying platform spread.
 *
 * Formula: credits = floor(usd_cents * (1 - PLATFORM_SPREAD))
 *
 * Example: $5.00 = 500 cents → floor(500 * 0.97) = 485 credits
 */
export function usdToCredits(usdCents: number): number {
  return Math.floor(usdCents * (1 - PLATFORM_SPREAD));
}

/**
 * Convert credits back to USD cents (inverse of usdToCredits, without spread).
 * Used for display purposes only — actual conversions include the spread.
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_DOLLAR;
}

// ── USDC Payment Verification ─────────────────────────────────

/**
 * Verify a USDC payment on Base by checking the transaction receipt.
 *
 * This function makes read-only RPC calls to Base to:
 * 1. Get the transaction receipt
 * 2. Verify the transaction succeeded
 * 3. Check for USDC Transfer events to the treasury address
 * 4. Verify the amount meets the minimum
 *
 * Returns a PaymentVerificationResult with the verified amount or rejection reason.
 */
export async function verifyUsdcPayment(
  txHash: string,
  treasuryAddress: string,
  rpcUrl: string = BASE_RPC_MAINNET,
  options: PaymentVerificationOptions = {},
): Promise<PaymentVerificationResult> {
  // ── Input validation ──
  if (!txHash || !txHash.startsWith("0x")) {
    return { verified: false, reason: "Transaction hash is required and must start with 0x" };
  }

  if (!treasuryAddress || !treasuryAddress.startsWith("0x")) {
    return { verified: false, reason: "Treasury address is required and must start with 0x" };
  }

  const minimumAmount = options.minimumAmount ?? MINIMUM_USDC_PAYMENT;

  try {
    // 1. Get transaction receipt
    const receipt = await ethGetTransactionReceipt(txHash, rpcUrl);

    if (!receipt) {
      return { verified: false, reason: "Transaction not found", txHash };
    }

    // 2. Check transaction succeeded (status = 1)
    if (receipt.status !== "0x1") {
      return {
        verified: false,
        reason: "Transaction reverted",
        txHash,
        blockNumber: parseInt(receipt.blockNumber, 16),
      };
    }

    // 3. Find USDC Transfer event to treasury
    const transferLog = receipt.logs?.find(
      (log: any) =>
        log.topics?.[0] === TRANSFER_EVENT_TOPIC &&
        log.address?.toLowerCase() === USDC_BASE_CONTRACT.toLowerCase(),
    );

    if (!transferLog) {
      return {
        verified: false,
        reason: "No USDC Transfer event found in transaction",
        txHash,
        blockNumber: parseInt(receipt.blockNumber, 16),
      };
    }

    // 4. Parse Transfer event: from (topic 1), to (topic 2), value (data)
    const toAddress = "0x" + (transferLog.topics?.[2]?.slice(26) ?? "").toLowerCase();
    const valueHex = transferLog.data ?? "0x0";
    const value = BigInt(valueHex);

    // 5. Verify recipient is treasury
    if (toAddress !== treasuryAddress.toLowerCase()) {
      return {
        verified: false,
        reason: `USDC sent to ${toAddress}, not treasury ${treasuryAddress}`,
        txHash,
        blockNumber: parseInt(receipt.blockNumber, 16),
      };
    }

    // 6. Verify amount meets minimum
    if (value < minimumAmount) {
      return {
        verified: false,
        reason: `Amount ${formatUsdc(value)} USDC is below minimum ${formatUsdc(minimumAmount)} USDC`,
        txHash,
        amountUsdc: value,
        blockNumber: parseInt(receipt.blockNumber, 16),
      };
    }

    // 7. Check expected amount if specified
    if (options.amountUsdc && value < options.amountUsdc) {
      return {
        verified: false,
        reason: `Amount ${formatUsdc(value)} USDC is below expected ${formatUsdc(options.amountUsdc)} USDC`,
        txHash,
        amountUsdc: value,
        blockNumber: parseInt(receipt.blockNumber, 16),
      };
    }

    // Convert USDC (6 decimals) to USD cents
    const usdCents = Number(value / 1_000_000n * 100n + (value % 1_000_000n) * 100n / 1_000_000n);

    const fromAddress = "0x" + (transferLog.topics?.[1]?.slice(26) ?? "").toLowerCase();

    return {
      verified: true,
      from: fromAddress,
      amountUsdc: value,
      amountUsdCents: usdCents,
      txHash,
      blockNumber: parseInt(receipt.blockNumber, 16),
    };
  } catch (err) {
    return {
      verified: false,
      reason: `Verification failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      txHash,
    };
  }
}

// ── RPC Helpers ─────────────────────────────────────────────────

async function ethGetTransactionReceipt(
  txHash: string,
  rpcUrl: string,
): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1,
    }),
  });

  const data = await response.json() as any;

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result;
}

// ── Formatting Helpers ─────────────────────────────────────────

/** Format USDC (6 decimals) to human-readable string, e.g. "5.00" */
export function formatUsdc(usdc: bigint): string {
  const whole = Number(usdc / 1_000_000n);
  const decimals = Number(usdc % 1_000_000n) / 1_000_000;
  return (whole + decimals).toFixed(2);
}

/** Format ETH (18 decimals) to human-readable string, e.g. "0.035" */
export function formatEth(wei: bigint): string {
  const whole = Number(wei / 10n ** 12n) / 10 ** 6;
  return whole.toFixed(6);
}