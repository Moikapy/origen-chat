-- Migration: Credits and subscription system for Origen Chat
-- Supports: free tier, Pro subscription, BYOK, credit-based model access
-- Applied: 2026-05-16

-- User subscription state
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',         -- 'free' | 'pro'
  credits_balance INTEGER NOT NULL DEFAULT 0,
  credits_monthly INTEGER NOT NULL DEFAULT 0, -- credits granted per month
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start INTEGER NOT NULL DEFAULT 0,
  current_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);

-- Credit transactions (audit trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,           -- positive = credit, negative = debit
  balance_after INTEGER NOT NULL,     -- balance after transaction
  type TEXT NOT NULL,                -- 'grant' | 'purchase' | 'usage' | 'refund' | 'rollover'
  description TEXT,                  -- 'Pro monthly grant', 'gpt-4o message', etc.
  model TEXT,                         -- model used (for usage type)
  session_id TEXT,                    -- chat session (for usage type)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON credit_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON credit_transactions(type);

-- Weekly usage aggregation (for dashboard display)
CREATE TABLE IF NOT EXISTS weekly_usage (
  user_id TEXT NOT NULL,
  week_start INTEGER NOT NULL,        -- Monday 00:00 UTC as unix timestamp
  free_messages INTEGER NOT NULL DEFAULT 0,
  standard_messages INTEGER NOT NULL DEFAULT 0,
  premium_messages INTEGER NOT NULL DEFAULT 0,
  total_credits_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_usage_user ON weekly_usage(user_id);

-- Model cost table (credits per message, by model slug)
-- This is reference data, not per-user
CREATE TABLE IF NOT EXISTS model_costs (
  model_slug TEXT PRIMARY KEY,         -- 'openrouter/free', 'gpt-4o', 'claude-opus', etc.
  display_name TEXT NOT NULL,           -- 'Free Models Router', 'GPT-4o', 'Claude Opus'
  tier TEXT NOT NULL DEFAULT 'standard',-- 'free' | 'standard' | 'premium' | 'reasoning'
  credits_per_message INTEGER NOT NULL, -- credit cost per message
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed model costs
INSERT OR IGNORE INTO model_costs (model_slug, display_name, tier, credits_per_message) VALUES
  ('openrouter/free', 'Free Models Router', 'free', 0),
  ('meta-llama/llama-3-8b-instruct:free', 'Llama 3 8B (Free)', 'free', 0),
  ('google/gemma-3-4b-it:free', 'Gemma 3 4B (Free)', 'free', 0),
  ('google/gemma-3-27b-it', 'Gemma 3 27B', 'standard', 3),
  ('meta-llama/llama-3-70b-instruct', 'Llama 3 70B', 'standard', 5),
  ('openai/gpt-4o-mini', 'GPT-4o Mini', 'standard', 3),
  ('anthropic/claude-haiku-4-5', 'Claude Haiku 4.5', 'standard', 3),
  ('openai/gpt-4o', 'GPT-4o', 'premium', 10),
  ('anthropic/claude-sonnet-4-5', 'Claude Sonnet 4.5', 'premium', 10),
  ('anthropic/claude-opus-4-5', 'Claude Opus 4.5', 'premium', 25),
  ('openai/gpt-4o-pro', 'GPT-4o Pro', 'premium', 25),
  ('openai/o3-mini', 'o3 Mini', 'reasoning', 15),
  ('openai/o3', 'o3', 'reasoning', 25),
  ('deepseek/deepseek-r1', 'DeepSeek R1', 'reasoning', 10);