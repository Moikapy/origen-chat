/**
 * Crypto payment verification for Origen Chat.
 */
export const USDC_BASE_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const TREASURY_ENV_VAR = "TREASURY_WALLET";
export const BASE_RPC_MAINNET = "https://mainnet.base.org";
export const CREDITS_PER_DOLLAR = 100;
export const PLATFORM_SPREAD = 0.03;
export const PRO_PRICE_CENTS = 500;
export const MINIMUM_USDC_PAYMENT = 1_000_000n;

const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
  amountUsdc?: bigint;
  minimumAmount?: bigint;
  maxBlockAge?: number;
}

/** Convert USD cents to Origen credits, applying platform spread. */
export function usdToCredits(usdCents: number): number {
  return Math.floor(usdCents * (1 - PLATFORM_SPREAD));
}

/** Convert credits back to USD cents (display only). */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_DOLLAR;
}

/** Verify a USDC payment on Base by checking the transaction receipt. */
export async function verifyUsdcPayment(txHash: string, treasuryAddress: string, rpcUrl: string = BASE_RPC_MAINNET, options: PaymentVerificationOptions = {}): Promise<PaymentVerificationResult> {
  if (!txHash || !txHash.startsWith("0x")) return { verified: false, reason: "Transaction hash is required and must start with 0x" };
  if (!treasuryAddress || !treasuryAddress.startsWith("0x")) return { verified: false, reason: "Treasury address is required and must start with 0x" };

  const minimumAmount = options.minimumAmount ?? MINIMUM_USDC_PAYMENT;

  try {
    const receipt = await ethGetTransactionReceipt(txHash, rpcUrl);
    if (!receipt) return { verified: false, reason: "Transaction not found", txHash };
    if (receipt.status !== "0x1") return { verified: false, reason: "Transaction reverted", txHash, blockNumber: parseInt(receipt.blockNumber, 16) };

    const transferLog = receipt.logs?.find((log: any) => log.topics?.[0] === TRANSFER_EVENT_TOPIC && log.address?.toLowerCase() === USDC_BASE_CONTRACT.toLowerCase());
    if (!transferLog) return { verified: false, reason: "No USDC Transfer event found", txHash, blockNumber: parseInt(receipt.blockNumber, 16) };

    const toAddress = "0x" + (transferLog.topics?.[2]?.slice(26) ?? "").toLowerCase();
    const value = BigInt(transferLog.data ?? "0x0");

    if (toAddress !== treasuryAddress.toLowerCase()) return { verified: false, reason: `USDC sent to ${toAddress}, not treasury`, txHash, blockNumber: parseInt(receipt.blockNumber, 16) };
    if (value < minimumAmount) return { verified: false, reason: `Amount below minimum`, txHash, amountUsdc: value, blockNumber: parseInt(receipt.blockNumber, 16) };
    if (options.amountUsdc && value < options.amountUsdc) return { verified: false, reason: `Amount below expected`, txHash, amountUsdc: value, blockNumber: parseInt(receipt.blockNumber, 16) };

    const usdCents = Number(value / 1_000_000n * 100n + (value % 1_000_000n) * 100n / 1_000_000n);
    const fromAddress = "0x" + (transferLog.topics?.[1]?.slice(26) ?? "").toLowerCase();
    return { verified: true, from: fromAddress, amountUsdc: value, amountUsdCents: usdCents, txHash, blockNumber: parseInt(receipt.blockNumber, 16) };
  } catch (err) {
    return { verified: false, reason: `Verification failed: ${err instanceof Error ? err.message : "Unknown error"}`, txHash };
  }
}

async function ethGetTransactionReceipt(txHash: string, rpcUrl: string): Promise<any> {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [txHash], id: 1 }) });
  const data = await response.json() as any;
  if (data.error) throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

/** Format USDC (6 decimals) to human-readable string. */
export function formatUsdc(usdc: bigint): string {
  const whole = Number(usdc / 1_000_000n);
  const decimals = Number(usdc % 1_000_000n) / 1_000_000;
  return (whole + decimals).toFixed(2);
}

/** Format ETH (18 decimals) to human-readable string. */
export function formatEth(wei: bigint): string {
  const whole = Number(wei / 10n ** 12n) / 10 ** 6;
  return whole.toFixed(6);
}