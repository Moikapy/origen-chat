/**
 * Flaunch SDK integration for Origen Chat.
 *
 * Handles:
 * 1. One-time RevenueManager deployment (2.5% protocol fee to Origen treasury)
 * 2. Token launches via flaunchIPFSWithRevenueManager
 * 3. Parsing PoolCreated events from launch transactions
 *
 * All on-chain operations happen client-side via MetaMask + viem.
 * Server only records results in D1.
 */

import { createFlaunch, type ReadWriteFlaunchSDK, type ReadFlaunchSDK } from "@flaunch/sdk";
import type { PublicClient, WalletClient, Hex } from "viem";

// ── Constants ─────────────────────────────────────────────────────

/** Origen's 2.5% protocol fee (of the 1% swap fee) */
export const ORIGEN_PROTOCOL_FEE_PERCENT = 2.5;

/** Origen's treasury wallet on Base */
export const ORIGEN_TREASURY = "0x1fC5F441de0800d7e92f8d111C7e2f2AFe038c8C" as const;

/** RevenueManager instance address — set after deployRevenueManager() */
let _revenueManagerAddress: string | null = null;

// ── SDK Factory ───────────────────────────────────────────────────

/** Create a read-only Flaunch SDK (no wallet needed) */
export function createFlaunchRead(publicClient: any): ReadFlaunchSDK {
  return createFlaunch({ publicClient } as any);
}

/** Create a read-write Flaunch SDK (requires wallet) */
export function createFlaunchReadWrite(publicClient: any, walletClient: any): ReadWriteFlaunchSDK {
  return createFlaunch({ publicClient, walletClient } as any) as ReadWriteFlaunchSDK;
}

// ── RevenueManager ───────────────────────────────────────────────

/**
 * Deploy a RevenueManager instance for Origen.
 * Call this ONCE — the address is reused for all subsequent token launches.
 */
export async function deployOrigenRevenueManager(flaunchWrite: ReadWriteFlaunchSDK): Promise<string> {
  const address = await flaunchWrite.deployRevenueManager({
    protocolRecipient: ORIGEN_TREASURY as `0x${string}`,
    protocolFeePercent: ORIGEN_PROTOCOL_FEE_PERCENT,
  });
  _revenueManagerAddress = address;
  return address;
}

/** Set a known RevenueManager address (after initial deployment) */
export function setRevenueManagerAddress(address: string): void {
  _revenueManagerAddress = address;
}

/** Get the cached RevenueManager address */
export function getRevenueManagerAddress(): string | null {
  return _revenueManagerAddress;
}

// ── Token Launch ──────────────────────────────────────────────────

export interface LaunchTokenParams {
  name: string;
  symbol: string;
  description: string;
  initialMarketCapUSD: number;
  creatorFeeAllocationPercent: number;
  base64Image: string;
  /** @deprecated FairLaunch is deprecated — set to 0 */
  fairLaunchPercent?: number;
  fairLaunchDuration?: number;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  discordUrl?: string;
}

/**
 * Launch a new token on Flaunch with Origen's RevenueManager + IPFS metadata.
 * Returns the transaction hash — call getPoolCreatedFromTx to parse results.
 */
export async function launchToken(
  flaunchWrite: ReadWriteFlaunchSDK,
  creatorAddress: string,
  params: LaunchTokenParams,
): Promise<Hex> {
  if (!_revenueManagerAddress) {
    throw new Error("RevenueManager not deployed. Call deployOrigenRevenueManager first or set the address.");
  }

  const hash = await flaunchWrite.flaunchIPFSWithRevenueManager({
    name: params.name,
    symbol: params.symbol,
    fairLaunchPercent: params.fairLaunchPercent ?? 0,
    fairLaunchDuration: params.fairLaunchDuration ?? 0,
    initialMarketCapUSD: params.initialMarketCapUSD,
    creator: creatorAddress as `0x${string}`,
    creatorFeeAllocationPercent: params.creatorFeeAllocationPercent,
    revenueManagerInstanceAddress: _revenueManagerAddress as `0x${string}`,
    metadata: {
      base64Image: params.base64Image,
      description: params.description,
      websiteUrl: params.websiteUrl,
      twitterUrl: params.twitterUrl,
      telegramUrl: params.telegramUrl,
      discordUrl: params.discordUrl,
    },
  } as any);

  return hash;
}

// ── Parse Launch Result ──────────────────────────────────────────

export interface ParsedLaunchResult {
  tokenAddress: string;
  tokenId: string;
  treasuryAddress: string;
  poolId: string;
}

/**
 * Parse a Flaunch transaction to extract the new token's addresses.
 * Call after launchToken() returns a tx hash and the tx is confirmed.
 */
export async function parseLaunchResult(
  flaunchRead: ReadFlaunchSDK,
  txHash: string,
): Promise<ParsedLaunchResult | null> {
  const poolCreated = await flaunchRead.getPoolCreatedFromTx(txHash as Hex);
  if (!poolCreated) return null;

  return {
    tokenAddress: poolCreated.memecoin,
    tokenId: poolCreated.tokenId.toString(),
    treasuryAddress: poolCreated.memecoinTreasury,
    poolId: poolCreated.poolId,
  };
}

// ── Image to Base64 ───────────────────────────────────────────────

/** Convert a File (from file input) to a base64 data URI for Flaunch IPFS */
export function fileToBase64Image(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}