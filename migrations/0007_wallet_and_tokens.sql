-- Migration: Wallet auth, token tracking, and crypto payments
-- Supports: SIWE wallet login, Flaunch token launch, USDC payments, revenue claims
-- Depends on: 0006_credits_subscriptions.sql (user_subscriptions, credit_transactions)

-- User wallet connections (MetaMask, WalletConnect, etc.)
CREATE TABLE IF NOT EXISTS user_wallets (
  user_id TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  wallet_address TEXT NOT NULL,           -- EIP-55 checksummed address
  wallet_type TEXT NOT NULL DEFAULT 'metamask', -- 'metamask' | 'walletconnect' | 'coinbase'
  is_primary INTEGER NOT NULL DEFAULT 0,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, chain, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON user_wallets(wallet_address);

-- Auth methods (linking wallets to accounts alongside magic link)
CREATE TABLE IF NOT EXISTS user_auth_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auth_type TEXT NOT NULL,               -- 'email_magic' | 'wallet_siwe'
  auth_identifier TEXT NOT NULL,           -- email address or wallet address
  chain_id INTEGER,                       -- for wallet auth (1=mainnet, 8453=base, etc.)
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(auth_type, auth_identifier),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_methods_user ON user_auth_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_methods_identifier ON user_auth_methods(auth_type, auth_identifier);

-- User's launched tokens (Flaunch and imported)
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id TEXT NOT NULL,
  token_address TEXT NOT NULL,           -- ERC20 contract on Base
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  royalty_nft_address TEXT,               -- Flaunch royalty NFT (creator revenue)
  revenue_manager_address TEXT,           -- RevenueManager contract address
  initial_market_cap_usdc INTEGER,       -- USDC (6 decimals)
  creator_revenue_bps INTEGER,           -- e.g. 6000 = 60% to creator
  protocol_fee_bps INTEGER NOT NULL DEFAULT 250, -- Origen's cut: 2.5%
  launch_tx_hash TEXT,                    -- deployment transaction hash
  source TEXT NOT NULL DEFAULT 'flaunch', -- 'flaunch' | 'import_clanker' | 'import_doppler' | 'import_virtuals'
  launched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, token_address)
);

CREATE INDEX IF NOT EXISTS idx_tokens_user ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_address ON user_tokens(token_address);

-- Crypto payment history (USDC on Base, ETH revenue claims)
CREATE TABLE IF NOT EXISTS crypto_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,                    -- 'revenue_claim' | 'direct_payment' | 'subscription'
  chain TEXT NOT NULL DEFAULT 'base',
  tx_hash TEXT,                          -- on-chain transaction hash
  amount_eth TEXT,                       -- BigInt as string (wei), null for USDC-only
  amount_usd_cents INTEGER,             -- USD value at time of transaction
  credits_granted INTEGER NOT NULL,     -- how many Origen credits this yielded
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed' | 'expired'
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user_subscriptions(user_id)
);

CREATE INDEX IF NOT EXISTS idx_crypto_topups_user ON crypto_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_topups_tx ON crypto_topups(tx_hash);
CREATE INDEX IF NOT EXISTS idx_crypto_topups_status ON crypto_topups(status);