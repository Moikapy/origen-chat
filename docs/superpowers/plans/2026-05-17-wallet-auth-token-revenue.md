# Implementation Plan: Wallet Auth + Token Revenue + Crypto Payments

> Phase 1 (Wallet Auth) only. Phases 2-5 in future plans.
> Spec: `docs/token-revenue-to-credits-spec.md`

## Starting State

Current auth: magic link email → `users` table → `magic_session` cookie
Current payments: credits system (free/pro plans) with Stripe placeholders
Current API keys: OpenRouter BYOK via OAuth or manual paste

## What We're Building

**Phase 1: Wallet Auth + Crypto Payments**

1. MetaMask/SIWE login (alongside magic link)
2. Wallet connection in settings
3. USDC-on-Base payment for Pro subscription
4. Token launch page (Flaunch SDK, sign-in required)
5. Revenue dashboard (claimable ETH, auto-convert to credits)

## File Plan

### New Files (17)
```
migrations/0007_wallet_and_tokens.sql          — D1 migration
lib/wallet.ts                                  — SIWE verification, wallet utils
lib/crypto-payments.ts                         — USDC payment verification on Base
lib/auth-gates.ts                              — canLaunchToken, canClaimRevenue, etc.
app/api/auth/wallet/route.ts                   — SIWE login endpoint
app/api/payments/verify/route.ts              — Verify on-chain USDC payment
app/api/payments/credits/route.ts             — Crypto top-up → credits
app/api/token/launch/route.ts                  — Flaunch token creation
app/api/token/revenue/route.ts                 — Revenue balance endpoint
components/wallet-connect.tsx                   — MetaMask connect button
components/crypto-payment.tsx                  — USDC payment flow (QR + confirm)
components/token-launch-form.tsx               — Flaunch token creation form
components/revenue-dashboard.tsx               — Claimable ETH display
app/settings/wallet/page.tsx                   — Wallet settings page
app/settings/billing/page.tsx                  — Crypto billing page
app/token/page.tsx                             — Token launch/dashboard page
lib/wallet.test.ts                              — Wallet auth tests
lib/crypto-payments.test.ts                    — Payment verification tests
```

### Modified Files (6)
```
lib/auth.ts                    — Add wallet state to useAuth
app/api/auth/session/route.ts  — Include wallet in session response
app/settings/page.tsx           — Add wallet/billing links
app/layout.tsx                 — No change (layout stays)
wrangler.toml                  — Add BASE_RPC env var
package.json                   — Add siwe, viem, @flaunch/sdk deps
```

## Task Breakdown

### Task 1: D1 Migration — wallet + tokens + crypto_topups
- [ ] Create `migrations/0007_wallet_and_tokens.sql`
- [ ] Add `user_wallets`, `user_auth_methods`, `user_tokens`, `crypto_topups` tables
- [ ] Test: run migration locally

### Task 2: SIWE Wallet Auth
- [ ] Create `lib/wallet.ts` — SIWE message verification, wallet signature checking
- [ ] Create `app/api/auth/wallet/route.ts` — POST endpoint: verify SIWE message, create/link user
- [ ] Modify `lib/auth.ts` — add `walletAddress`, `walletConnected` to `useAuth` state
- [ ] Modify `app/api/auth/session/route.ts` — include wallet info in session response
- [ ] Create `components/wallet-connect.tsx` — MetaMask connect button
- [ ] Create `app/settings/wallet/page.tsx` — connect/disconnect wallets

### Task 3: Auth Gates
- [ ] Create `lib/auth-gates.ts` — canLaunchToken, canClaimRevenue, canPayWithCrypto
- [ ] Test: unit tests for each gate

### Task 4: Crypto Payments (USDC on Base)
- [ ] Create `lib/crypto-payments.ts` — verify USDC Transfer event on Base
- [ ] Create `app/api/payments/verify/route.ts` — verify tx, grant Pro or credits
- [ ] Create `app/api/payments/credits/route.ts` — crypto top-up → credits endpoint
- [ ] Add `BASE_RPC_URL`, `TREASURY_WALLET`, `USDC_BASE_CONTRACT` to wrangler.toml
- [ ] Create `components/crypto-payment.tsx` — QR code + confirm UI
- [ ] Create `app/settings/billing/page.tsx` — pay with USDC, view history

### Task 5: Token Launch (Flaunch)
- [ ] Install `@flaunch/sdk`, `viem`
- [ ] Create `app/api/token/launch/route.ts` — auth-gated token creation
- [ ] Create `components/token-launch-form.tsx` — name, symbol, market cap, revenue % form
- [ ] Create `app/token/page.tsx` — launch dashboard + auth gate
- [ ] Test: form validation, auth gate check

### Task 6: Revenue Dashboard
- [ ] Create `app/api/token/revenue/route.ts` — fetch claimable ETH from RevenueManager
- [ ] Create `components/revenue-dashboard.tsx` — display claimable ETH, credits conversion
- [ ] Modify `app/token/page.tsx` — show revenue for user's tokens

### Task 7: Settings Integration
- [ ] Modify `app/settings/page.tsx` — add Wallet and Billing links
- [ ] Wire up everything end-to-end

### Task 8: Tests + Build
- [ ] `lib/wallet.test.ts`
- [ ] `lib/crypto-payments.test.ts`
- [ ] `lib/auth-gates.test.ts` (already covered in Task 3)
- [ ] Run `vitest run`
- [ ] Run `tsc --noEmit`
- [ ] Run `next build`

## Dependencies to Install

```bash
npm install siwe viem @flaunch/sdk @metamask/sdk
```

## Assumptions

1. Flaunch SDK works client-side in Next.js (it should — it's ESM)
2. MetaMask is injected as `window.ethereum` in the browser
3. Base mainnet RPC is used for production, Base Sepolia for dev
4. USDC contract on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
5. Treasury wallet address stored as env var, not hardcoded
6. The `users` table from magic-link auth has `id` and `email` — we link wallet to this user

## Not In Scope (Future Phases)

- Auto-claim cron (Phase 5) — manual claim button first
- ETH → USDC conversion via 1inch — manual claim shows ETH, convert later
- Token import from Clanker/Doppler/Virtuals (Phase 4)
- x402 payment middleware (future consideration)