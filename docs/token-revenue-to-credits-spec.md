# Token-Revenue-to-Credits: The Closed Loop

> Users launch tokens → earn ETH from trading fees → auto-pay for Origen Chat.
> Users connect MetaMask → pay with crypto → subscribe or top up.
> The circle of value.

## The Vision (3 Flows)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORIGEN CHAT                                  │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │   FLOW A     │   │   FLOW B     │   │   FLOW C (existing)    │  │
│  │              │   │              │   │                        │  │
│  │  Flaunch     │   │  MetaMask    │   │  OpenRouter BYOK      │  │
│  │  Token       │   │  Login +     │   │  (user tops up on     │  │
│  │  Revenue     │   │  USDC Pay    │   │  openrouter.ai with   │  │
│  │              │   │              │   │  crypto, pastes key)  │  │
│  │  ETH fees    │   │  USDC on     │   │                        │  │
│  │  → auto-     │   │  Base →      │   │  Already works, no    │  │
│  │  convert to  │   │  Pro sub     │   │  change needed        │  │
│  │  credits     │   │              │   │                        │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────────────────┘  │
│         │                   │                                      │
│         ▼                   ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              D1: user_subscriptions                           │  │
│  │  credits_balance += auto_top_up_amount                       │  │
│  │  plan = 'pro' (after first crypto payment)                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │                                                         │
│         ▼                                                         │
│  🤖 Chat with premium models (deducted from credits)              │
└─────────────────────────────────────────────────────────────────────┘
```

## Flow A: Token Revenue → Auto-Top-Up Credits

### How It Works

1. User launches a token on Flaunch (via Origen UI)
2. Token generates trading fees → ETH accumulates in Flaunch's `RevenueManager` contract
3. **Origen's backend periodically checks** the user's claimable ETH balance
4. When credits are low, Origen:
   - Calls `claim()` on the RevenueManager to withdraw ETH to a hot wallet
   - Converts ETH → USDC via a DEX aggregator (1inch on Base, ~$0.01 gas)
   - Credits the user's Origen balance at the current ETH/USD rate (minus a small spread)
5. User's `credits_balance` increases — they chat as usual

### Key Insight: The Revenue Manager Contract

Flaunch's `RevenueManager` is an escrow contract sitting between the token's trading fees and the creator. It supports:
- `protocolRecipient` — an address that receives protocol fees (this is **Origen's treasury**)
- `protocolFee` — a percentage (0-100%) that Origen takes as platform fee
- `creator` — the user's wallet, receives the rest

**This means Origen gets a cut of every token launched through the platform, automatically.**

```
Token trading fees
  → RevenueManager contract
    → protocolFee% → Origen treasury wallet (ETH)
    → (100 - protocolFee)% → User's wallet (ETH)

Both can auto-convert to Origen credits.
```

### Implementation

**New D1 tables:**
```sql
-- User's wallet connection
CREATE TABLE IF NOT EXISTS user_wallets (
  user_id TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  wallet_address TEXT NOT NULL,          -- EIP-55 checksummed
  wallet_type TEXT NOT NULL DEFAULT 'metamask',
  is_primary INTEGER NOT NULL DEFAULT 0,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, chain, wallet_address)
);

-- User's launched tokens
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id TEXT NOT NULL,
  token_address TEXT NOT NULL,           -- Flaunch token contract on Base
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  royalty_nft_address TEXT,               -- Creator revenue NFT
  revenue_manager_address TEXT,           -- RevenueManager contract
  initial_market_cap_usdc INTEGER,       -- USDC (6 decimals)
  creator_revenue_bps INTEGER,           -- e.g. 6000 = 60%
  protocol_fee_bps INTEGER DEFAULT 250,  -- Origen's cut: 2.5%
  launch_tx_hash TEXT,
  launched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, token_address)
);

-- Crypto top-up history
CREATE TABLE IF NOT EXISTS crypto_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 'revenue_claim' | 'direct_payment' | 'subscription'
  chain TEXT NOT NULL DEFAULT 'base',
  tx_hash TEXT,                          -- on-chain tx hash
  amount_eth TEXT,                       -- BigInt as string (wei)
  amount_usd_cents INTEGER,             -- USD value at time of conversion
  credits_granted INTEGER NOT NULL,     -- how many Origen credits this yielded
  status TEXT NOT NULL DEFAULT 'pending',-- 'pending' | 'completed' | 'failed'
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);

CREATE INDEX idx_crypto_topups_user ON crypto_topups(user_id);
CREATE INDEX idx_crypto_topups_tx ON crypto_topups(tx_hash);
```

**Revenue claiming (Worker Cron):**
```typescript
// scheduled handler — runs every hour
export async function checkRevenueClaims(db: D1Database, baseRpc: string) {
  const tokens = await db
    .prepare("SELECT * FROM user_tokens")
    .all();

  for (const token of tokens.results) {
    // 1. Check claimable ETH on RevenueManager
    const claimable = await getClaimableRevenue(baseRpc, token.revenue_manager_address);
    
    if (claimable > MIN_CLAIM_THRESHOLD_WEI) {
      // 2. Claim to hot wallet
      const txHash = await claimRevenue(token.revenue_manager_address, claimable);
      
      // 3. Wait for confirmation, then convert ETH → credits
      const usdValue = await ethToUsd(claimable);
      const credits = usdToCredits(usdValue);
      
      // 4. Grant credits to user (minus platform fee)
      await grantCredits(db, token.user_id, credits, 'revenue_claim', 
        `Token revenue: ${token.token_symbol}`);
      await recordTopup(db, { ...token, claimable, usdValue, credits, txHash });
    }
  }
}
```

### ETH-to-Credits Conversion

```
1 ETH = $3,500 (approx)
1 credit = $0.01 (1 cent)

So 0.01 ETH (~$35) = 3,500 credits = ~1.75 months of Pro

Conversion formula:
  credits = floor(usd_value_cents * (1 - PLATFORM_SPREAD))
  
Where PLATFORM_SPREAD = 0.03 (3% spread covers gas + conversion costs)
```

Users see this in their settings:
```
💰 Token Revenue
├── Claimable: 0.024 ETH ($84.00)
├── Pending conversion: 0.01 ETH ($35.00)
├── Lifetime earned: $312.50
└── [Claim & Convert to Credits →]
```

---

## Flow B: MetaMask Login + Crypto Payment

### How It Works

1. User clicks "Connect Wallet" on login/settings page
2. MetaMask prompts: "Sign this message to prove ownership" (SIWE — EIP-4361)
3. Backend verifies signature, links wallet to Origen account
4. On settings/billing page: "Pay with USDC on Base"
5. User sends USDC to Origen's treasury wallet
6. Origen Worker verifies payment on-chain (Base RPC), grants Pro or credits

### SIWE Login Flow

```typescript
// lib/siwe.ts
import { generateNonce, parseSiweMessage, verifySiweMessage } from 'siwe';

export async function verifyWalletLogin(
  message: string,
  signature: string,
  expectedDomain: string
): Promise<{ address: string; chainId: number } | null> {
  const parsed = parseSiweMessage(message);
  if (parsed.domain !== expectedDomain) return null;
  
  const result = await verifySiweMessage({ message, signature });
  return result.success
    ? { address: result.data.address, chainId: result.data.chainId }
    : null;
}
```

### USDC Payment Verification (Worker-side)

```typescript
// lib/crypto-payments.ts
const TREASURY = '0x...'; // Origen's Base wallet
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Official USDC on Base
const PRO_PRICE_USDC = 500n * 1000000n; // $5.00 in USDC (6 decimals)

export async function verifyUsdcPayment(
  txHash: string,
  baseRpc: string
): Promise<{ verified: boolean; amount: bigint; from: string }> {
  // 1. Get transaction receipt from Base
  // 2. Verify: to === USDC contract, transfer to TREASURY, amount >= PRO_PRICE
  // 3. Return sender address for linking to user
}
```

### Frontend Components

```
app/auth/wallet/page.tsx     -- SIWE wallet login
app/settings/wallet/page.tsx -- Connect/disconnect wallets, view balances
app/settings/billing/page.tsx -- Pay with USDC/ETH, view payment history
components/wallet-connect.tsx -- Reusable EIP-1193 wallet connector
components/crypto-payment.tsx -- USDC payment flow (QR + confirm)
```

---

## Flow C: OpenRouter BYOK (Already Works)

Users who want to pay OpenRouter directly with crypto can:
1. Go to openrouter.ai/settings/credits
2. Top up with crypto (Coinbase Business Checkout)
3. Copy their API key
4. Paste it in Origen's "Set API Key" page (already exists at `/api/auth/set-api-key`)

**No changes needed.** This flow already works.

---

## The Closed Loop: Why This Is Powerful

```
User launches token on Flaunch
  → Token gets traded
    → Trading fees generate ETH
      → RevenueManager splits:
        → 97.5% to user wallet
        → 2.5% to Origen (protocol fee)
      → User's ETH auto-converts to credits
        → Credits pay for premium models
          → Better models = better content
            → More attention = more trading
              → More ETH revenue (loop closes)

Meanwhile:
  → Origen's 2.5% cut accumulates
    → Covers server costs
    → Funds the free tier
    → Sustains the platform
```

**Every participant wins:**
- **Users** get premium AI for free (funded by their token's popularity)
- **Popular creators** earn more than they spend (net positive)
- **Origen** takes a small but compounding cut of all trading volume
- **The platform** becomes more attractive as a token launch venue (network effects)

---

## Dependencies

| Package | Purpose | Phase |
|---------|---------|-------|
| `viem` | Ethereum/Base interactions | B |
| `siwe` | Sign-In with Ethereum (EIP-4361) | B |
| `@metamask/sdk` | Browser wallet connection | B |
| `@flaunch/sdk` | Token creation on Base | A |
| `x402-hono` | HTTP 402 payment middleware (future) | — |

**No private keys ever touch Origen's servers.** All signing happens client-side in MetaMask. The Worker only verifies on-chain data.

---

## OpenRouter Crypto: Current State

OpenRouter's programmatic crypto API (`POST /api/v1/credits/coinbase`) is **deprecated**. They now use Coinbase Business Checkouts via web UI.

**This is fine.** The user's vision isn't about programmatically topping up OpenRouter — it's about:
1. Users paying OpenRouter directly (Flow C — already works via BYOK)
2. Users paying Origen with crypto (Flow B — new)
3. Token revenue auto-funding Origen credits (Flow A — new, the real differentiator)

---

## Build Order

### Phase 1: Wallet Auth (3-4 days)
- `npm install siwe viem @metamask/sdk`
- SIWE login endpoint + wallet settings page
- Link MetaMask to existing magic-link accounts
- D1: `user_wallets` table + `user_auth_methods` table

### Phase 2: Crypto Payments (3-4 days)
- USDC payment verification on Base (Worker reads chain)
- `/api/payments/verify` endpoint
- Billing page with "Pay with USDC" option
- D1: `crypto_topups` table
- Auto-upgrade to Pro on verified payment

### Phase 3: Token Launch (5-7 days)
- `npm install @flaunch/sdk`
- Token creation UI (`/token`)
- RevenueManager with protocol fee (2.5% to Origen)
- Revenue dashboard showing claimable ETH
- Manual "Claim & Convert" button first, auto-claim cron later
- D1: `user_tokens` table

### Phase 4: Auto-Top-Up (2-3 days)
- Cron Worker checks RevenueManager balances
- ETH → USDC conversion via 1inch aggregator on Base
- Auto-grant credits when balance is low
- Notification: "Your token revenue auto-funded 2,000 credits"

---

## Revenue Model Summary

| Stream | Source | Currency | Trigger | Recurring |
|--------|--------|----------|---------|-----------|
| Pro subscription | User payment | USDC/USD | Monthly | Yes |
| Token protocol fee | Flaunch RevenueManager | ETH | Per trade | Yes |
| Credit purchases | User top-ups | USDC | On-demand | No |
| BYOK (OpenRouter) | User's own key | Their crypto | N/A | N/A |

**The beauty:** Token protocol fees compound. More users → more tokens → more trades → more ETH for Origen — without any per-user marginal cost.

---

## Pricing: Credits from ETH

| ETH Price | ETH Amount | USD Value | Credits (×0.97 spread) | Pro Months |
|-----------|-----------|-----------|------------------------|-----------|
| $3,500 | 0.01 | $35.00 | 3,395 | ~1.7 |
| $3,500 | 0.1 | $350.00 | 33,950 | ~17 |
| $3,500 | 1.0 | $3,500 | 339,500 | ~170 |

A token with $35/month in trading fees fully funds a Pro subscription.
A token with $350/month in trading fees covers Pro for over a year.

**Most active community tokens easily exceed this.** Flaunch's top creators are making 6-7 figures per month in trading fees.