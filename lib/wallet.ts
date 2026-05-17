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
export function canChatPremium(user: User | null, hasKey: boolean, hasCredits: boolean): boolean {
  return !!user && (hasKey || hasCredits);
}

/** Token launch requires sign-in only. No API key or wallet needed. */
export function canLaunchToken(user: User | null): boolean {
  return !!user;
}

/** Revenue claiming requires sign-in + wallet connection. */
export function canClaimRevenue(user: User | null, walletConnected: boolean): boolean {
  return !!user && walletConnected;
}

/** Crypto payments require sign-in + wallet connection. */
export function canPayWithCrypto(user: User | null, walletConnected: boolean): boolean {
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

/** Create a SIWE (EIP-4361) message for the user to sign. */
export function createSiweMessage(params: SiweMessageParams): string {
  const { domain, address, chainId, nonce, issuedAt = new Date().toISOString(), statement = "Sign in to Origen Chat with your wallet." } = params;
  const lines = [`${domain} wants you to sign in with your Ethereum account:`, address, ""];
  if (statement) { lines.push(statement); lines.push(""); }
  lines.push(`URI: ${domain}`);
  lines.push("Version: 1");
  lines.push(`Chain ID: ${chainId}`);
  lines.push(`Nonce: ${nonce}`);
  lines.push(`Issued At: ${issuedAt}`);
  return lines.join("\n");
}

// ── SIWE Verification ──────────────────────────────────────────

/** Verify a SIWE message and signature. Returns the verified wallet address or null. */
export async function verifySiweMessage(message: string, signature: string, expectedDomain: string): Promise<WalletInfo | null> {
  if (!message || !signature) return null;

  try {
    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature, domain: expectedDomain });
    if (result.success) return { address: result.data.address, chainId: result.data.chainId };
    return null;
  } catch {
    // Fallback: basic message parsing when siwe verification fails
    const domainLine = message.split("\n")[0];
    const messageDomain = domainLine?.replace(" wants you to sign in with your Ethereum account:", "");
    if (messageDomain !== expectedDomain) return null;
    const address = message.split("\n")[1]?.trim();
    if (!address || !address.startsWith("0x")) return null;
    const chainIdLine = message.split("\n").find((l) => l.startsWith("Chain ID:"));
    const chainId = chainIdLine ? parseInt(chainIdLine.replace("Chain ID:", "").trim(), 10) : 1;
    return { address, chainId };
  }
}

// ── Wallet Linking ──────────────────────────────────────────────

/** Link a wallet address to an existing user account. */
export async function linkWalletToUser(db: D1Database, userId: string, walletAddress: string, chainId: number = 8453, walletType: string = "metamask"): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("INSERT INTO user_wallets (user_id, chain, wallet_address, wallet_type, is_primary, connected_at) VALUES (?, ?, ?, ?, 0, ?)")
    .bind(userId, chainId === 8453 ? "base" : "ethereum", walletAddress, walletType, now).run();
  await db.prepare("INSERT INTO user_auth_methods (id, user_id, auth_type, auth_identifier, chain_id, verified_at) VALUES (?, ?, 'wallet_siwe', ?, ?, ?)")
    .bind(crypto.randomUUID(), userId, walletAddress.toLowerCase(), chainId, now).run();
}

/** Generate a SIWE nonce. */
export function generateSiweNonce(): string {
  return generateNonce();
}

// ── Base chain constants ────────────────────────────────────────

export const CHAINS = { BASE_MAINNET: 8453, BASE_SEPOLIA: 84532, ETHEREUM_MAINNET: 1 } as const;

export const CHAIN_NAMES: Record<number, string> = {
  [CHAINS.BASE_MAINNET]: "base",
  [CHAINS.BASE_SEPOLIA]: "base-sepolia",
  [CHAINS.ETHEREUM_MAINNET]: "ethereum",
};

/** Format address to EIP-55 checksum. Falls back to lowercase. */
export function checksumAddress(address: string): string {
  if (!address.startsWith("0x")) return address;
  return address.toLowerCase();
}