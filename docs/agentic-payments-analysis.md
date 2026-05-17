# Cloudflare Agentic Payments Integration — Origen Chat

## What Cloudflare Agentic Payments Does

Cloudflare's Agents SDK now has **first-class support for agentic payments** — letting AI agents pay for services programmatically via HTTP `402 Payment Required`. Two protocols are supported:

### x402 (Coinbase + Cloudflare)
- Uses **on-chain stablecoin payments** (USDC on Base, Ethereum, Solana)
- Three HTTP headers: `X-PAYMENT-REQUIRED`, `X-PAYMENT-SIGNATURE`, `X-PAYMENT-RESPONSE`
- Server doesn't need blockchain connectivity — offloads verification to a **facilitator**
- SDK provides: `withX402` / `paidTool` for MCP servers, `x402-hono` middleware for HTTP Workers, `withX402Client` for MCP clients

### MPP — Machine Payments Protocol (Tempo Labs + Stripe)
- IETF standards-track extension of the 402 pattern
- Multiple payment methods: **cards (Stripe)**, Bitcoin Lightning, stablecoins
- Two payment intents: **`charge`** (one-time) and **`session`** (streaming, sub-cent, sub-ms latency)
- Backwards-compatible with x402 — MPP clients can consume x402 services

### The 402 Flow
1. Client requests a resource
2. Server responds `402` with a payment challenge (what to pay, how much, where)
3. Client fulfills payment and retries with a payment credential
4. Server verifies (via facilitator for x402, or directly) and returns the resource + receipt

**No accounts, sessions, or pre-shared API keys required.** Agents handle everything programmatically.

---

## Why This Matters for Origen Chat

Origen Chat already runs on **Cloudflare Workers** — the same platform these agentic payment primitives are built for. This is one of those rare alignment moments where your infrastructure and a new capability are *made for each other*.

The current payment model (magic link → Stripe → Pro subscription → credits) works for humans. But it creates friction for:

1. **AI agents** using Origen Chat as a tool — they can't create Stripe accounts or manage magic links
2. **Programmatic access** — API consumers who want pay-per-use without subscriptions
3. **Micropayments** — per-message billing at sub-cent granularity
4. **Crypto-native users** — who'd rather pay in USDC on Base than deal with Stripe

---

## Integration Paths

### Path A: x402 — Charge for API Access with USDC

**What:** Gate Origen Chat's `/api/chat` endpoint behind x402. AI agents (or any programmatic client) can pay per message in USDC on Base.

**How it fits your stack:**
```
Client (agent/human)
  → Cloudflare Worker (Origen Chat)
  → x402 middleware checks: is this request paid?
  → If no: 402 response with payment details (amount, USDC contract, facilitator URL)
  → If yes: forward to /api/chat, process normally
```

**Implementation options:**

| Option | Approach | Best For |
|--------|----------|----------|
| **x402-hono middleware** | Add `x402-hono` to your existing Worker | API pay-per-message |
| **x402-proxy** | Deploy separate Worker in front of Origen | Non-invasive, origin-agnostic |
| **`withX402` on MCP server** | Wrap Origen's chat as a paid MCP tool | Agent-to-agent payments |

**x402-hono middleware (recommended for Path A):**
```typescript
// In your existing Worker entry point
import { x402Hono } from 'x402-hono';

const app = new Hono();

// Protect the chat endpoint with USDC payment
app.use('/api/chat', x402Hono({
  price: '$0.002',  // ~0.2¢ per message
  network: 'base',
  facilitator: 'https://x402.org/facilitator',
  walletAddress: process.env.TREASURY_WALLET,  // Your Base wallet
}));

// Everything else is free (auth, credits check, etc.)
app.route('/api', apiRoutes);
```

**Why x402 over manual crypto:**
- No need to verify on-chain tx yourself — facilitator handles it
- No RPC calls from your Worker — the facilitator validates payment
- Works for both human and agentic clients
- Built into the Cloudflare ecosystem you're already on

---

### Path B: MPP — Stripe + Crypto + Streaming Payments

**What:** Use MPP to support both card payments (via Stripe) and crypto (USDC), with **session-based streaming** for per-token billing.

**Why MPP over pure x402 for Origen:**
1. **Stripe integration** — Users can pay with credit cards without leaving the app. MPP abstracts this.
2. **Streaming sessions** — Instead of per-message billing, you can bill per-token-generated (sub-cent, sub-ms). A user sends a prompt, the response streams tokens, and payment accrues in real-time.
3. **Backwards compatible with x402** — MPP clients consume x402 services without modification. You get both protocols.

**MPP charge (one-time) vs session (streaming):**

| Intent | Use Case | Latency | Granularity |
|--------|----------|----------|-------------|
| `charge` | "Pay $5 for Pro month" | ~2s (on-chain) | Fixed amount |
| `charge` (Stripe) | "Pay $5 for Pro month" | ~1s (card) | Fixed amount |
| `session` | "Pay per token generated" | <1ms | Sub-cent |

**For Origen Chat specifically:**
- Pro subscription → MPP `charge` with Stripe (replaces or supplements current credit system)
- Per-message billing → MPP `session` (replaces credits with real-time micro-billing)
- Agent access → x402 `charge` with USDC (backwards compatible)

---

### Path C: x402 + Flaunch — The Combined Play

**This is the interesting one.** x402 and Flaunch serve different but complementary purposes:

| | x402 / MPP | Flaunch |
|---|---|---|
| **Purpose** | Pay for API access | Launch your own token |
| **Direction** | Money → Origen | Money → Creator |
| **Who pays** | Agent/user pays Origen | Traders pay creator |
| **Currency** | USDC (stable, predictable) | ETH (variable, speculative) |
| **Revenue model** | Per-use or subscription | Trading fees + royalties |

**How they combine:**
1. **Origen earns via x402** — Every API call from agents is paid in USDC via 402
2. **Users earn via Flaunch** — Users launch tokens and earn trading fees in ETH
3. **Swap referrer fees** — If tokens launched through Origen include Origen as the x402 referrer, you earn on both sides
4. **Pro via MPP** — Humans subscribe via Stripe (MPP charge), agents pay per-use (x402), token creators get ETH (Flaunch)

```
┌──────────────────────────────────────────────────────┐
│                    Origen Chat                        │
│                                                      │
│  Human users ──► MPP (Stripe) ──► Pro subscription  │
│  AI agents   ──► x402 (USDC)   ──► Per-message       │
│  Token launch──► Flaunch        ──► Creator revenue  │
│                                                      │
│  All flowing through Workers on Cloudflare           │
└──────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Current Stack Alignment

Origen Chat is already on the exact stack these protocols expect:

| Current Component | Agentic Payment Integration |
|---|---|
| Cloudflare Workers | x402-hono middleware, MPP proxy — all run natively |
| D1 | Store payment records, wallet mappings |
| OpenNext/Cloudflare | Same Worker runtime, just add middleware |
| KV | Cache payment verification results |
| wrangler | Already have it — just add `x402-hono` dep |

### New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `x402-hono` | x402 middleware for Hono/Workers | Small |
| `@flaunch/sdk` | Token creation | Medium |
| `viem` | Web3 interactions (Base) | ~150KB tree-shaken |
| `siwe` | Sign-In with Ethereum | ~20KB |
| `@metamask/sdk` | Wallet connect (optional) | ~100KB lazy |

**Critical:** All wallet signing is **client-side only**. Workers only verify — never sign transactions or hold private keys.

### Wrangler Changes

```toml
# Add to wrangler.toml
[vars]
TREASURY_WALLET = "0x..."  # Your Base wallet for receiving USDC
ORIGIN_URL = "https://origen-chat.moikapy.workers.dev"

# D1 binding already exists (DB)
# KV binding for payment caching
[[kv_namespaces]]
binding = "PAYMENTS"
id = "..."
```

### D1 Schema Additions (Combined x402 + Flaunch)

```sql
-- x402/MPP payment receipts
CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tx_hash TEXT,                          -- on-chain (x402) or charge ID (MPP/Stripe)
  protocol TEXT NOT NULL DEFAULT 'x402', -- 'x402' | 'mpp_charge' | 'mpp_session'
  amount_usd_cents INTEGER NOT NULL,     -- standardize to cents
  token TEXT NOT NULL DEFAULT 'usdc',    -- 'usdc' | 'eth' | 'stripe'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'verified' | 'refunded'
  facilitator_response TEXT,              -- JSON from x402 facilitator
  verified_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_receipts_user ON payment_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tx ON payment_receipts(tx_hash);
```

---

## Revenue Model Comparison

| Revenue Stream | Protocol | Per-user | Recurring | Marginal Cost |
|---------------|----------|----------|-----------|---------------|
| Pro subscription | MPP (Stripe) | $5-20/mo | Yes | ~0 |
| Per-message (agents) | x402 (USDC) | $0.002/msg | No | LLM API cost |
| Per-message (humans, overage) | x402 or MPP | $0.002/msg | No | LLM API cost |
| Token launch referral | Flaunch | Variable | Yes | 0 |
| Token trading fees | Flaunch (referral) | % of swap | Yes | 0 |

**The play:** x402 handles the "pay for access" side. Flaunch handles the "users create value" side. Origen sits in the middle as the platform that connects AI, payments, and token economies.

---

## Recommended Build Order

### Phase 1 — x402 Pay-per-Message (3-5 days)
**Highest impact, lowest risk.** Your Workers are already there.
1. `npm install x402-hono`
2. Add `x402Hono` middleware to `/api/chat`
3. Set `TREASURY_WALLET` env var (Base address)
4. Deploy — agents can now pay USDC per message
5. Keep existing credit system as fallback for human users

### Phase 2 — Wallet Auth + MPP for Humans (5-7 days)
**Make it work for humans too.**
1. Add SIWE wallet auth (from Flaunch analysis)
2. MPP `charge` intent for Pro subscription via Stripe
3. Keep x402 as crypto payment path
4. Users choose: Stripe (card) or USDC (crypto)

### Phase 3 — Flaunch Token Launch (5-7 days)
**The differentiator.** Depends on wallet auth from Phase 2.
1. `@flaunch/sdk` integration
2. Token creation UI at `/token`
3. Revenue dashboard showing ETH earnings
4. Swap referrer setup for Origen's cut

---

## Key Insight: Why Both Together

**x402 solves "how to pay." Flaunch solves "what to earn."**

- x402/MPP: Origen gets paid. Every API call, every message, every subscription. Clean, programmatic, agent-friendly.
- Flaunch: Users get paid. Their tokens generate revenue. Origen takes a referral cut.

Without x402: Flaunch token creators still need a way to pay for Origen Chat (they'd use Stripe — friction for crypto-native users).
Without Flaunch: x402 pays the bills but doesn't create a moat. Anyone can copy the pay-per-message model.
**Together:** Origen becomes the platform where AI agents pay to chat AND users launch tokens that earn revenue. That's a two-sided marketplace with strong network effects.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| x402 is new (2025) | SDK may have breaking changes | Pin versions, monitor x402.org updates |
| MPP is IETF draft | Protocol could shift | Start with x402 (more stable), add MPP later |
| USDC depeg | Payments worth less | x402 facilitator checks real-time price |
| Users confused by crypto | Churn | Keep Stripe/MPP as primary, crypto as option |
| Facilitator downtime | Payment failures | Cache verified payments in KV (1hr TTL) |
| Regulatory | SEC/classification | x402 uses USDC (stablecoin, not security), Flaunch uses fair launch mechanics |

---

## Links

- x402 spec: https://www.x402.org/
- MPP spec: https://mpp.dev/
- Cloudflare Agentic Payments docs: https://developers.cloudflare.com/agents/agentic-payments/
- x402-proxy template: https://github.com/cloudflare/templates/tree/main/x402-proxy-template
- Flaunch docs: https://docs.flaunch.gg/
- Flaunch SDK: https://www.npmjs.com/package/@flaunch/sdk