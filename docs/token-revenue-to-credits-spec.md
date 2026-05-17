# Token-Revenue-to-Credits Spec — Origen Chat

> Users launch tokens → earn ETH from trading fees → auto-pay for Origen Chat.
> Users connect MetaMask → pay with crypto → subscribe or top up.
> The circle of value.

---

## Design Decisions

### Product Philosophy: Chat is the Hook

**Signing up is free.** Magic link email — no credit card, no crypto, no API key. Just an email.

| Feature | Requires Sign-In | Requires API Key | Requires Wallet |
|---------|:-:|:-:|:-:|
| Chat (free models) | ❌ No | ❌ No | ❌ No |
| Chat (premium models) | ✅ Yes | ✅ Yes (or credits) | ❌ No |
| Memory / session sync | ✅ Yes | ❌ No | ❌ No |
| Token launch | ✅ Yes | ❌ No | ❌ No |
| Token dashboard / revenue | ✅ Yes | ❌ No | ❌ No |
| Claim revenue (withdraw ETH) | ✅ Yes | ❌ No | ✅ Yes |
| Pay with crypto (USDC) | ✅ Yes | ❌ No | ✅ Yes |
| Import existing tokens | ✅ Yes | ❌ No | ✅ Yes (ownership proof) |

**The flow:** Chat for free → get hooked → sign in to save progress → launch a token → connect wallet to claim revenue → revenue auto-funds premium chat.

```typescript
// lib/auth-gates.ts
export function canChatFree(): boolean {
  return true; // Always — chat is the hook
}

export function canChatPremium(user: User | null, hasKey: boolean, hasCredits: boolean): boolean {
  return !!user && (hasKey || hasCredits);
}

export function canLaunchToken(user: User | null): boolean {
  return !!user; // Just needs an account — sign-up is free
}

export function canClaimRevenue(user: User | null, walletConnected: boolean): boolean {
  return !!user && walletConnected;
}

export function canPayWithCrypto(user: User | null, walletConnected: boolean): boolean {
  return !!user && walletConnected;
}
```

**No wallet required to launch.** The Flaunch RevenueManager wallet is created on-chain at token launch time. Wallet connection (MetaMask) is only needed to **claim revenue** and **pay with crypto**.

### Token Import: Phase 2, Not Phase 1

Flaunch supports importing existing ERC20 tokens from Clanker, Doppler, and Virtuals — but only if the user is the **onchain admin/owner** of the token. More complex to verify, fewer users benefit.

- **Phase 1:** Flaunch-native launch only. Clean, simple, most users.
- **Phase 2:** Add import for Clanker/Doppler/Virtuals. Same RevenueManager → credits flow.

---

## The Flows

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ORIGEN CHAT                                   │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │   FLOW A     │   │   FLOW B     │   │   FLOW C (existing)     │ │
│  │              │   │              │   │                          │ │
│  │  Flaunch     │   │  MetaMask    │   │  OpenRouter BYOK        │ │
│  │  Token       │   │  USDC Pay    │   │  (top up on openrouter  │ │
│  │  Revenue     │   │              │   │   .ai, paste key)       │ │
│  │              │   │              │   │                          │ │
│  │  ETH fees    │   │  USDC on     │   │  Already works, no      │ │
│  │  → auto-     │   │  Base →      │   │  change needed          │ │
│  │  convert to  │   │  Pro sub     │   │                          │ │
│  │  credits     │   │              │   │                          │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────────────────────┘ │
│         │                  │                                        │
│         ▼                  ▼                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              D1: user_subscriptions                             │ │
│  │  credits_balance += auto_top_up_amount                          │ │
│  │  plan = 'pro' (after first crypto payment)                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│         │                                                           │
│         ▼                                                           │
│  🤖 Chat with premium models (deducted from credits)               │
└──────────────────────────────────────────────────────────────────────┘
```

### Flow A: Token Revenue → Auto-Top-Up Credits

1. User launches token on Flaunch (via Origen UI, auth required)
2. Token generates trading fees → ETH accumulates in Flaunch's RevenueManager
3. Origen Worker periodically checks claimable ETH balance
4. When credits are low, Origen:
   - Claims ETH from RevenueManager to hot wallet
   - Converts ETH → USDC via DEX aggregator (1inch on Base, ~$0.01 gas)
   - Credits user's balance at current ETH/USD rate minus 3% spread
5. `credits_balance` increases — chat as usual

**Key: RevenueManager has a `protocolFee` parameter.** Origen sets `protocolRecipient` to its treasury wallet and `protocolFee` to 2.5%. Every token launched through Origen sends 2.5% of trading fees to us. Forever.

```
Token trading fees
  → RevenueManager contract
    → protocolFee (2.5%) → Origen treasury wallet
    → (97.5%) → User's wallet
```

### Flow B: MetaMask Login + USDC Payment

1. User clicks "Connect Wallet" on login/settings
2. MetaMask signs SIWE message (EIP-4361)
3. Backend verifies signature, links wallet to Origen account
4. User pays USDC on Base to Origen's treasury wallet
5. Worker verifies on-chain payment, grants Pro or credits

### Flow C: BYOK (Already Works)

Users top up OpenRouter directly with crypto → paste API key → done. Zero changes needed.

---

## The Closed Loop

```
User launches token on Flaunch
  → Token gets traded
    → Trading fees generate ETH
      → RevenueManager splits:
        → 97.5% to user wallet
        → 2.5% to Origen (protocol fee)
      → User's ETH auto-converts to credits
        → Credits pay for premium models
          → Better AI = better content
            → More attention = more trading
              → More ETH revenue (loop closes)
```

---

## D1 Schema Additions

```sql
-- User's wallet connection (needed for claiming revenue + payments)
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
  user_id TEXT NOT NULL,                 -- must have openrouterConnected = true
  token_address TEXT NOT NULL,           -- ERC20 contract on Base
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  royalty_nft_address TEXT,              -- Creator revenue NFT
  revenue_manager_address TEXT,          -- RevenueManager contract
  initial_market_cap_usdc INTEGER,       -- USDC (6 decimals)
  creator_revenue_bps INTEGER,           -- e.g. 6000 = 60%
  protocol_fee_bps INTEGER DEFAULT 250,  -- Origen's cut: 2.5%
  launch_tx_hash TEXT,
  source TEXT NOT NULL DEFAULT 'flaunch', -- 'flaunch' | 'import_clanker' | 'import_doppler' | 'import_virtuals'
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

CREATE INDEX IF NOT EXISTS idx_crypto_topups_user ON crypto_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_topups_tx ON crypto_topups(tx_hash);

-- Auth methods (linking wallets to accounts)
CREATE TABLE IF NOT EXISTS user_auth_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auth_type TEXT NOT NULL,               -- 'email_magic' | 'wallet_siwe'
  auth_identifier TEXT NOT NULL,         -- email address or wallet address
  chain_id INTEGER,                      -- for wallet auth
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(auth_type, auth_identifier),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);
```

---

## ETH → Credits Conversion

```
1 credit = $0.01 (1 cent)

Conversion formula:
  credits = floor(usd_value_cents × (1 - PLATFORM_SPREAD))
  where PLATFORM_SPREAD = 0.03 (3% covers gas + conversion costs)

Examples:
  0.01 ETH ($35.00) → 3,395 credits → ~1.7 months of Pro
  0.1  ETH ($350.00) → 33,950 credits → ~17 months of Pro
  1.0  ETH ($3,500) → 339,500 credits → ~170 months of Pro
```

---

## Auth Gate: Token Launch (Sign-In Only)

The `/token` page and API endpoint only require sign-in — not an API key:

```typescript
// app/token/page.tsx (client)
const { user } = useAuth();

if (!user) {
  return (
    <div className="flex flex-col items-center gap-4 p-8">
      <h2>Sign In to Launch a Token</h2>
      <p>Creating an account is free. Launch your token and earn from day one.</p>
      <button onClick={() => signIn()}>Sign In with Email</button>
    </div>
  );
}

// app/api/token/launch/route.ts (server)
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  // User is authenticated — proceed with Flaunch
  // No API key required. No wallet required.
  // ...
}
```

Revenue claiming and crypto payments still require MetaMask — but those are separate flows that happen *after* launch.

**No wallet required to launch.** The RevenueManager address is generated on-chain by the Flaunch SDK call. The user only needs MetaMask to:
- Claim revenue (withdraw ETH)
- Pay directly with USDC (Flow B)
- Import tokens (Phase 2, verify onchain ownership)

---

## Dependencies

| Package | Purpose | Phase |
|---------|---------|-------|
| `viem` | Ethereum/Base interactions | B |
| `siwe` | Sign-In with Ethereum (EIP-4361) | B |
| `@metamask/sdk` | Browser wallet connection | B |
| `@flaunch/sdk` | Token creation on Base | A |
| `x402-hono` | HTTP 402 payment middleware (future) | — |

**No private keys ever touch Origen's servers.** All signing is client-side.

---

## Build Order

### Phase 1: Wallet Auth (3-4 days)
- `npm install siwe viem @metamask/sdk`
- SIWE login endpoint: `app/api/auth/wallet/route.ts`
- Wallet settings page: `app/settings/wallet/page.tsx`
- Link MetaMask to existing magic-link accounts
- D1: `user_wallets` + `user_auth_methods` tables
- Migration: `0007_wallet_auth.sql`

### Phase 2: Crypto Payments (3-4 days)
- USDC payment verification on Base (Worker reads chain)
- `app/api/payments/verify/route.ts`
- Billing page with "Pay with USDC" option
- `app/settings/billing/page.tsx`
- D1: `crypto_topups` table
- Auto-upgrade to Pro on verified payment

### Phase 3: Token Launch (5-7 days)
- `npm install @flaunch/sdk`
- Token creation UI: `app/token/page.tsx` — gated to `user && openrouterConnected`
- RevenueManager with protocol fee (2.5% to Origen)
- Revenue dashboard showing claimable ETH
- Manual "Claim & Convert" button first
- D1: `user_tokens` table
- **No wallet required to launch** — RevenueManager address created on-chain

### Phase 4: Import Existing Tokens (3-4 days)
- Flaunch import flow for Clanker/Doppler/Virtuals tokens
- Onchain admin verification (user must be token owner)
- Same RevenueManager → credits conversion
- Import form: `app/token/import/page.tsx`
- `source` column in `user_tokens` distinguishes import source

### Phase 5: Auto-Top-Up (2-3 days)
- Cron Worker checks RevenueManager balances
- ETH → USDC conversion via 1inch aggregator on Base
- Auto-grant credits when balance is low
- Notification: "Your token revenue auto-funded 2,000 credits"

---

## Revenue Model

| Stream | Source | Currency | Trigger | Recurring |
|--------|--------|----------|---------|-----------|
| Pro subscription | User payment | USDC/USD | Monthly | Yes |
| Token protocol fee | Flaunch RevenueManager | ETH | Per trade | Yes |
| Credit purchases | User top-ups | USDC | On-demand | No |
| BYOK (OpenRouter) | User's own key | Their crypto | N/A | N/A |

**The play:** Token protocol fees compound. More users → more tokens → more trades → more ETH for Origen — without marginal cost.

---

## OpenRouter Crypto: Current State

OpenRouter's programmatic crypto API (`POST /api/v1/credits/coinbase`) is **deprecated**. They now use Coinbase Business Checkouts via web UI. This is fine — Flow C (BYOK) already works, and Flows A and B bypass OpenRouter's billing entirely.

---

## Flaunch Token Import (Phase 4 Detail)

Flaunch supports importing tokens from:
- **Clanker** — if you're the onchain `admin` of the `ClankerToken`
- **Doppler** — if you're the onchain `integrator` of the `DopplerAirlock`
- **Virtuals** — if you're the onchain `admin` of a `AgentToken`

When imported:
- No new ERC20 is created — existing token bridges into Flaunch's Uniswap V4 pool
- An ERC721 memestream NFT is minted showing ownership of revenue
- All ETH yield goes to the memestream owner
- Progressive Bid Wall and auto buybacks still apply
- RevenueManager works the same way → same credits conversion

This is a Phase 2 feature because it requires:
1. Onchain ownership verification (different per protocol)
2. Import transaction UX (more complex than simple launch)
3. Smaller user base (only existing token creators)