# Flaunch Integration Analysis — Origen Chat

## What Flaunch Does

Flaunch is a **token launchpad on Base** (Ethereum L2) that lets anyone create an ERC20 token with:

- **Fixed-price fair launch** — removes early price risk / sniper advantage
- **Creator revenue in ETH** — trading fees flow to the creator as ETH, not tokens
- **Royalty NFT** — revenue rights are tokenized as a transferable NFT (can be sold, fractionalized, or DAO-managed)
- **Auto buybacks** — community tokens are automatically bought back and burned
- **Revenue managers** — route revenue to wallets, groups, or custom contracts
- **`@flaunch/sdk`** (npm) — TypeScript SDK for programmatic coin creation

The killer insight: **a Flaunched token is both a token AND a revenue position**. Trading fees generate ETH for the creator, and those rights are an NFT that can be transferred or sold.

---

## How This Maps to Origen Chat

Origen Chat currently has:

| Layer | Current | Gap |
|-------|---------|-----|
| **Auth** | Magic link (email) via `@moikapy/magic-link` | No wallet auth |
| **Payments** | Credit system (free/pro tiers, BYOK) with Stripe fields in D1 | No crypto payments |
| **Identity** | User ID from magic link session | No onchain identity |
| **Database** | D1 (Cloudflare SQLite) with subscriptions, credits, sessions | No wallet/token tables |
| **Frontend** | Next.js + Tailwind on Cloudflare Workers | No wallet UI |

---

## Three Integration Paths

### Path 1: Token Launch for Users (Flaunch-as-a-Feature)

**What:** Give each Origen Chat user the ability to "flaunch" their own token tied to their account/brand.

**How it works:**
1. User connects MetaMask (or any EIP-1193 wallet) on a `/token` settings page
2. User fills in token name, ticker, initial market cap, creator revenue %, fair launch duration
3. Origen calls `@flaunch/sdk` → `flaunchCoin()` on Base via the user's wallet
4. Token address + royalty NFT are stored in D1 (`user_wallets` table)
5. The user's profile page shows their token: price, market cap, 24h volume, holder count
6. Revenue from the token flows to the user's wallet in ETH

**Schema additions:**
```sql
CREATE TABLE user_wallets (
  user_id TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',         -- 'base' | 'ethereum' | 'arbitrum'
  wallet_address TEXT NOT NULL,                 -- EIP-55 checksummed
  wallet_type TEXT NOT NULL DEFAULT 'metamask', -- 'metamask' | 'walletconnect' | 'coinbase'
  is_primary INTEGER NOT NULL DEFAULT 0,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, chain, wallet_address)
);

CREATE TABLE user_tokens (
  user_id TEXT NOT NULL,
  token_address TEXT NOT NULL,         -- ERC20 contract address on Base
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  royalty_nft_address TEXT,            -- Flaunch royalty NFT (creator revenue)
  market_cap_usdc INTEGER,             -- initial market cap in USDC (6 decimals)
  creator_revenue_bps INTEGER,         -- e.g. 6000 = 60% to creator
  fair_launch_duration INTEGER,        -- seconds
  launch_tx_hash TEXT,                 -- deployment transaction
  launched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, token_address)
);
```

**Frontend:**
- `app/settings/wallet/page.tsx` — connect/disconnect wallets, view balances
- `app/token/page.tsx` — token dashboard (launch, stats, revenue)
- `components/wallet-connect.tsx` — reusable EIP-1193 wallet connector
- `lib/wallet.ts` — wallet auth utilities

---

### Path 2: Crypto Payments for Subscriptions (ETH/USDC for Pro)

**What:** Accept ETH or USDC on Base as payment for the Pro subscription, as an alternative to Stripe.

**How it works:**
1. User already has wallet from Path 1 (or connects one)
2. `/settings/billing` shows: "Pay with ETH on Base" option
3. On-chain payment: user sends X ETH/USDC to Origen's treasury wallet
4. Worker verifies payment via Base RPC (or Alchemy/Infura), activates Pro tier in D1
5. Recurring: either manual renewal reminders or on-chain subscription via a simple smart contract

**Two approaches:**

| Approach | Complexity | Trust Model |
|----------|-----------|-------------|
| **One-time payment + manual renewal** | Low | User pays, we verify on-chain, grant Pro |
| **On-chain subscription contract** | High | Smart contract handles recurring debits |

**Recommendation:** Start with one-time payments. They're simple, transparent, and avoid the smart contract complexity. Add recurring later if demand exists.

**Payment verification (worker-side):**
```typescript
// lib/crypto-payments.ts
export async function verifyBasePayment(
  txHash: string,
  expectedAmount: bigint,  // in wei or USDC units
  treasuryAddress: string
): Promise<{ verified: boolean; blockNumber: number }> {
  const BASE_RPC = 'https://mainnet.base.org';
  const tx = await fetch(BASE_RPC, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionReceipt',
      params: [txHash],
      id: 1
    })
  }).then(r => r.json());

  // Verify: to address matches treasury, value >= expected, status = 1 (success)
  // For USDC: parse Transfer event log
}
```

**Schema addition:**
```sql
CREATE TABLE crypto_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  token TEXT NOT NULL DEFAULT 'eth',        -- 'eth' | 'usdc'
  amount_wei TEXT NOT NULL,                  -- BigInt as string
  usd_value_at_time INTEGER,                -- USD cents at time of payment
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'verified' | 'failed' | 'refunded'
  verified_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);
CREATE INDEX idx_crypto_payments_user ON crypto_payments(user_id);
CREATE INDEX idx_crypto_payments_tx ON crypto_payments(tx_hash);
```

---

### Path 3: Wallet Sync + Hybrid Auth (MetaMask as Login)

**What:** Let users sign in with their crypto wallet instead of (or in addition to) magic link email.

**How it works:**
1. User clicks "Connect Wallet" on login page
2. Wallet prompts: "Sign this message to prove ownership" (SIWE — Sign-In with Ethereum)
3. Backend verifies signature against wallet address
4. Look up existing Origen account linked to that wallet → log in
5. If no account exists, create one with wallet as primary identity
6. User can link/unlink both email and wallet to the same account

**Implementation:**
- Use `siwe` (Sign-In with Ethereum) library — industry standard (EIP-4361)
- `@walletconnect/modal` or `@metamask/sdk` for wallet UI
- Origen backend verifies the SIWE message + signature

```typescript
// lib/siwe.ts
import { generateNonce, parseSiweMessage, verifySiweMessage } from 'siwe';

export async function verifyWalletLogin(
  message: string,
  signature: string,
  expectedDomain: string
): Promise<{ address: string; chainId: number } | null> {
  try {
    const parsed = parseSiweMessage(message);
    if (parsed.domain !== expectedDomain) return null;
    
    const result = await verifySiweMessage({ message, signature });
    return result.success 
      ? { address: result.data.address, chainId: result.data.chainId }
      : null;
  } catch {
    return null;
  }
}
```

**Schema:**
```sql
CREATE TABLE user_auth_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auth_type TEXT NOT NULL,             -- 'email_magic' | 'wallet_siwe'
  auth_identifier TEXT NOT NULL,       -- email address or wallet address
  chain_id INTEGER,                    -- for wallet auth
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(auth_type, auth_identifier),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);
```

---

## Dependency Tree

```
Path 1 (Token Launch) ──► requires Path 3 (Wallet Auth)
Path 2 (Crypto Payments) ─► requires Path 3 (Wallet Auth)
Path 3 (Wallet Auth) ────► standalone, can ship first
```

**Recommended order:**
1. **Ship Path 3 first** — wallet auth is the foundation everything else needs
2. **Then Path 2** — crypto payments for Pro is simpler and higher immediate value
3. **Then Path 1** — token launch is the ambitious, differentiating feature

---

## Key Dependencies

| Package | Purpose | Size |
|----------|---------|------|
| `@flaunch/sdk` | Token creation, swap, management | Flaunch's SDK |
| `viem` | TypeScript Ethereum library (lightweight, tree-shakeable) | ~150KB |
| `siwe` | Sign-In with Ethereum (EIP-4361) | ~20KB |
| `@metamask/sdk` | MetaMask browser integration | ~100KB (lazy-loaded) |
| `@walletconnect/modal` | Multi-wallet support (optional, if you want more than MetaMask) | ~200KB (lazy) |

**Important:** All wallet/crypto code should be **client-side only** (no SSR). Cloudflare Workers don't run browser crypto. The worker only verifies — it never signs transactions.

---

## Architecture Considerations

### Browser-Only Crypto Layer
All wallet interactions (connect, sign transactions, send ETH) happen **client-side in the browser**. The worker is purely for:
- Verifying on-chain payments (read-only RPC calls to Base)
- Storing wallet addresses and token data in D1
- Serving the wallet-connect UI components

### No Private Key Handling
Origen **never** touches private keys. The user's wallet signs everything. We just verify signatures and read on-chain data.

### Base L2 Choice
Base (Coinbase's L2) is the right chain because:
- Flaunch deploys there natively
- Gas fees are ~$0.01 per tx
- USDC is natively available
- MetaMask and most wallets support it out of the box
- Coinbase users can bridge easily

### Rate Limits & Edge Cases
- Wallet connection is instant (no on-chain tx)
- Token launch is an on-chain tx — user pays gas (~$0.01-0.05 on Base)
- Payment verification requires an RPC call — cache in KV for 60s to avoid D1 + RPC on every request
- Token stats (price, mcap) can be polled from Flaunch's API or Base RPC

---

## Quick Start: What to Build First

### Phase 1 — Wallet Auth (2-3 days)
1. `npm install siwe viem @metamask/sdk`
2. Create `app/auth/wallet/page.tsx` — sign-in-with-ethereum flow
3. Create `app/api/auth/wallet/route.ts` — verify SIWE message, create/link session
4. Add `user_auth_methods` table to D1
5. Add "Connect Wallet" button to settings page
6. Link wallet to existing magic-link accounts

### Phase 2 — Crypto Payments (2-3 days)
1. Add `crypto_payments` table to D1
2. Create `/settings/billing` page with "Pay with ETH" option
3. Worker endpoint to verify on-chain payment and upgrade to Pro
4. Add `PRO_PRICE_USDC` and `TREASURY_WALLET` env vars

### Phase 3 — Token Launch (5-7 days)
1. `npm install @flaunch/sdk`
2. Add `user_wallets` and `user_tokens` tables to D1
3. Create `/token` page — launch form, token dashboard
4. Client-side token creation via Flaunch SDK
5. Token stats polling from Flaunch API or Base RPC
6. Revenue display (ETH earned from trading fees)

---

## Revenue Model Impact

With Flaunch integration, Origen Chat has three revenue streams:

1. **Pro subscriptions** — $X/month via Stripe or crypto (current + Path 2)
2. **Referral fees from token launches** — Flaunch supports [swap referrers](/guides/setting-a-swap-referrer) that earn a % of every swap on tokens you referred. If you're the launchpad, you earn on every trade.
3. **Platform revenue share** — if you build a custom Flaunch manager contract, you can route a % of all token revenue through your platform

The swap referrer feature is particularly interesting — every token launched through Origen could include Origen as the referrer, generating ongoing revenue from trading volume, not just one-time launch fees.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Flaunch SDK breaking changes | Medium | Pin versions, write integration tests |
| Gas price spikes on Base | Low | Base fees are consistently cheap; display estimated gas before tx |
| Wallet phishing attacks | Medium | Clear domain verification in SIWE messages, never ask for seed phrases |
| Regulatory (token = security?) | Medium | Flaunch's fair launch mechanics help, but get legal review before launch |
| User confusion re: crypto UX | High | Make wallet optional, keep magic link as primary, clear onboarding |
| RPC rate limits | Low | Use Cloudflare Gateway or Alchemy free tier (300M CU/month) |