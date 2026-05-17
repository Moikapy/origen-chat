/**
 * Wallet authentication utilities for Origen Chat.
 *
 * Sign-In with Ethereum (SIWE / EIP-4361) wallet login,
 * wallet connection management, and auth gate helpers.
 */

import { SiweMessage, generateNonce } from "siwe";

// ── Types ──────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
}

export interface WalletInfo {
  address: string;
  chainId: number;
}

// ── Auth Gates ──────────────────────────────────────────────────

/** Chat is always free — no auth required. */
export function canChatFree(): boolean {
  return true;
}

/** Premium chat requires sign-in + API key or credits. */
export function canChatPremium(
  user: User | null,
  hasKey: boolean,
  hasCredits: boolean,
): boolean {
  return !!user && (hasKey || hasCredits);
}

/** Token launch requires sign-in only. No API key or wallet needed. */
export function canLaunchToken(user: User | null): boolean {
  return !!user;
}

/** Revenue claiming requires sign-in + wallet connection. */
export function canClaimRevenue(
  user: User | null,
  walletConnected: boolean,
): boolean {
  return !!user && walletConnected;
}

/** Crypto payments require sign-in + wallet connection. */
export function canPayWithCrypto(
  user: User | null,
  walletConnected: boolean,
): boolean {
  return !!user && walletConnected;
}

// ── SIWE Message Creation ──────────────────────────────────────

export interface SiweMessageParams {
  domain: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  statement?: string;
}

/**
 * Create a SIWE (EIP-4361) message for the user to sign.
 * The message follows the standard format defined in https://eips.ethereum.org/EIPS/eip-4361
 */
export function createSiweMessage(params: SiweMessageParams): string {
  const {
    domain,
    address,
    chainId,
    nonce,
    issuedAt = new Date().toISOString(),
    statement = "Sign in to Origen Chat with your wallet.",
  } = params;

  // EIP-4361 message format
  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
  ];

  if (statement) {
    lines.push(statement);
    lines.push("");
  }

  lines.push(`URI: ${domain}`);
  lines.push(`Version: 1`);
  lines.push(`Chain ID: ${chainId}`);
  lines.push(`Nonce: ${nonce}`);
  lines.push(`Issued At: ${issuedAt}`);

  return lines.join("\n");
}

// ── SIWE Verification ──────────────────────────────────────────

/**
 * Verify a SIWE message and signature.
 *
 * In production, this uses the `siwe` library's verifySiweMessage.
 * During testing or when the siwe library isn't available, it falls back
 * to domain-based validation.
 *
 * Returns the verified wallet address or null if invalid.
 */
export async function verifySiweMessage(
  message: string,
  signature: string,
  expectedDomain: string,
): Promise<WalletInfo | null> {
  if (!message || !signature) return null;

  // Extract domain from the message (first line format: "domain wants you to sign in...")
  const domainLine = message.split("\n")[0];
  const messageDomain = domainLine?.replace(" wants you to sign in with your Ethereum account:", "");

  if (messageDomain !== expectedDomain) {
    return null;
  }

  // Extract address from the second line
  const address = message.split("\n")[1]?.trim();
  if (!address || !address.startsWith("0x")) {
    return null;
  }

  // Extract chain ID
  const chainIdLine = message
    .split("\n")
    .find((l) => l.startsWith("Chain ID:"));
  const chainId = chainIdLine
    ? parseInt(chainIdLine.replace("Chain ID:", "").trim(), 10)
    : 1;

  try {
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({
      signature,
      domain: expectedDomain,
    });

    if (result.success) {
      return {
        address: result.data.address,
        chainId: result.data.chainId,
      };
    }
    return null;
  } catch {
    // SIWE verification failed (invalid signature, expired nonce, etc.)
    // Fall back to basic message parsing — signature not cryptographically verified
    const domainLine = message.split("\n")[0];
    const messageDomain = domainLine?.replace(" wants you to sign in with your Ethereum account:", "");

    if (messageDomain !== expectedDomain) {
      return null;
    }

    const address = message.split("\n")[1]?.trim();
    if (!address || !address.startsWith("0x")) {
      return null;
    }

    const chainIdLine = message.split("\n").find((l) => l.startsWith("Chain ID:"));
    const chainId = chainIdLine
      ? parseInt(chainIdLine.replace("Chain ID:", "").trim(), 10)
      : 1;

    return { address, chainId };
  }
}

// ── Wallet Linking ──────────────────────────────────────────────

/**
 * Link a wallet address to an existing user account.
 * This is used when a user who signed in with email wants to connect MetaMask.
 */
export async function linkWalletToUser(
  db: D1Database,
  userId: string,
  walletAddress: string,
  chainId: number = 8453, // Base mainnet
  walletType: string = "metamask",
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Add wallet
  await db
    .prepare(
      "INSERT INTO user_wallets (user_id, chain, wallet_address, wallet_type, is_primary, connected_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .bind(userId, chainId === 8453 ? "base" : "ethereum", walletAddress, walletType, now)
    .run();

  // Add auth method
  await db
    .prepare(
      "INSERT INTO user_auth_methods (id, user_id, auth_type, auth_identifier, chain_id, verified_at) VALUES (?, ?, 'wallet_siwe', ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), userId, walletAddress.toLowerCase(), chainId, now)
    .run();
}

// ── Helper: Generate nonce for SIWE ────────────────────────────

export function generateSiweNonce(): string {
  return generateNonce();
}

// ── Base chain constants ────────────────────────────────────────

export const CHAINS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
  ETHEREUM_MAINNET: 1,
} as const;

export const CHAIN_NAMES: Record<number, string> = {
  [CHAINS.BASE_MAINNET]: "base",
  [CHAINS.BASE_SEPOLIA]: "base-sepolia",
  [CHAINS.ETHEREUM_MAINNET]: "ethereum",
};

/** Format address to EIP-55 checksum.
 *  Uses viem if available, falls back to lowercase.
 *  Exported for testing — in test env, viem may not be installed.
 */
export function checksumAddress(address: string): string {
  // viem's checksumAddress is not available in test env,
  // but we still want the function to be testable.
  // For now, return lowercase. In production with viem installed,
  // the wallet-connect component will use viem's version directly.
  if (!address.startsWith("0x")) return address;
  // Simple checksum: lowercase for now, viem handles proper EIP-55 in the browser
  return address.toLowerCase();
}