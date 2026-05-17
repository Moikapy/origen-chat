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

**The flow:** Free chat → get hooked → sign in to save progress → launch a token → connect wallet to claim revenue → revenue auto-funds premium chat.

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

**No wallet required to launch.** The Flaunch RevenueManager wallet is created on-chain at launch time. Wallet connection (MetaMask) is only needed to **claim revenue** and **pay with crypto**.

### Token Import: Phase 4, Not Phase 1

Flaunch supports importing existing ERC20 tokens (from Clanker, Doppler, Virtuals) — but only if the user is the **onchain admin/owner** of the token.

- **Phase 1:** Flaunch-native launch only. Clean, simple, most users.
- **Phase 4:** Add import for Clanker/Doppler/Virtuals. Same RevenueManager → credits flow.

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
└──────────────────────────────────────────────────────────────────────┘
```

### Flow A: Token Revenue → Auto-Top-Up Credits

1. User launches token on Flaunch (via Origen UI, auth required)
2. Token generates trading fees → ETH accumulates in Flaunch's RevenueManager
3. Origen Worker periodically checks claimable ETH balance
4. When credits are low, Origen claims ETH → converts to credits (minus 3% spread)
5. `credits_balance` increases — chat as usual

**Key: RevenueManager has `protocolFee` (2.5% to Origen).** Every token launched through Origen sends 2.5% of trading fees to us. Forever.

### Flow B: MetaMask Login + USDC Payment

1. User clicks "Connect Wallet" → MetaMask signs SIWE message (EIP-4361)
2. Backend verifies signature, links wallet to Origen account
3. User sends USDC on Base to Origen's treasury wallet
4. Worker verifies on-chain payment, grants Pro or credits

### Flow C: BYOK (Already Works)

Users top up OpenRouter directly with crypto → paste API key → done.

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
-- User's wallet connection
CREATE TABLE IF NOT EXISTS user_wallets (
  user_id TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL DEFAULT 'metamask',
  is_primary INTEGER NOT NULL DEFAULT 0,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, chain, wallet_address)
);

-- Auth methods (linking wallets to accounts)
CREATE TABLE IF NOT EXISTS user_auth_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  auth_identifier TEXT NOT NULL,
  chain_id INTEGER,
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(auth_type, auth_identifier),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);

-- User's launched tokens
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  royalty_nft_address TEXT,
  revenue_manager_address TEXT,
  initial_market_cap_usdc INTEGER,
  creator_revenue_bps INTEGER,
  protocol_fee_bps INTEGER DEFAULT 250,
  launch_tx_hash TEXT,
  source TEXT NOT NULL DEFAULT 'flaunch',
  launched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, token_address)
);

-- Crypto top-up history
CREATE TABLE IF NOT EXISTS crypto_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  tx_hash TEXT,
  amount_eth TEXT,
  amount_usd_cents INTEGER,
  credits_granted INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);

CREATE INDEX IF NOT EXISTS idx_crypto_topups_user ON crypto_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_topups_tx ON crypto_topups(tx_hash);
```

---

## Auth Gate: Token Launch (Sign-In Only)

The `/token` page only requires sign-in — not an API key:

```typescript
// app/token/page.tsx
const { user } = useAuth();
if (!user) {
  return <SignInPrompt message="Sign in to launch your token" />;
}
// User is authenticated — show launch form
```

Revenue claiming and crypto payments still require MetaMask — but those are separate flows after launch.

---

## Dependencies

| Package | Purpose | Phase |
|---------|---------|-------|
| `viem` | Ethereum/Base interactions | B |
| `siwe` | Sign-In with Ethereum (EIP-4361) | B |
| `@metamask/sdk` | Browser wallet connection | B |
| `@flaunch/sdk` | Token creation on Base | A |

---

## Build Phases

### Phase 1: Wallet Auth (3-4 days)
- `npm install siwe viem @metamask/sdk`
- SIWE login: `app/api/auth/wallet/route.ts`
- Wallet settings: `app/settings/wallet/page.tsx`
- Link MetaMask to magic-link accounts
- D1: `user_wallets` + `user_auth_methods` tables

### Phase 2: Crypto Payments (3-4 days)
- USDC payment verification on Base
- `app/api/payments/verify/route.ts`
- Billing page with "Pay with USDC"
- D1: `crypto_topups` table

### Phase 3: Token Launch (5-7 days)
- `npm install @flaunch/sdk`
- Auth-gated token creation: `app/api/token/launch/route.ts`
- Token UI: `app/token/page.tsx`
- RevenueManager with 2.5% protocol fee
- D1: `user_tokens` table

### Phase 4: Import Existing Tokens (3-4 days)
- Flaunch import for Clanker/Doppler/Virtuals
- Onchain admin verification
- Same RevenueManager → credits conversion

### Phase 5: Auto-Top-Up (2-3 days)
- Cron Worker checks RevenueManager balances
- ETH → USDC conversion via 1inch on Base
- Auto-grant credits when balance is low

### Phase 6: ERC-8004 Agent Registration (Future)
- Register Origen Chat as an ERC-8004 agent on Base
- Set `agentWallet` to treasury address
- Publish agent registration file with MCP endpoint
- Other agents discover Origen via the registry, pay via x402
- Reputation signals accumulate on-chain
- Depends on ERC-8004 reaching stable draft (currently Draft status, Aug 2025)

---

## Revenue Model

| Stream | Source | Currency | Recurring |
|--------|--------|----------|-----------|
| Pro subscription | User payment | USDC/USD | Yes |
| Token protocol fee | Flaunch RevenueManager | ETH | Yes |
| Credit purchases | User top-ups | USDC | No |
| x402 agent payments | Other AI agents | USDC | Yes |

---

## OpenRouter Crypto: Current State

OpenRouter's programmatic crypto API is **deprecated**. They use Coinbase Business Checkouts via web UI. This is fine — Flow C (BYOK) already works, and Flows A/B bypass OpenRouter billing entirely.