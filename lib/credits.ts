/**
 * Origen Chat Credits System
 *
 * Subscription-based credits that scale with model cost.
 * - Free tier: free models only, no credits needed
 * - Pro tier: 2,000 credits/month, premium models cost varying credits
 * - BYOK: bring your own key, unlimited, no credits consumed
 *
 * Design doc: migrations/0006_credits_subscriptions.sql
 */

// ── Types ──────────────────────────────────────────────────────

export type Plan = "free" | "pro";

export interface UserSubscription {
  userId: string;
  plan: Plan;
  creditsBalance: number;
  creditsMonthly: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  type: "grant" | "purchase" | "usage" | "refund" | "rollover";
  description: string | null;
  model: string | null;
  sessionId: string | null;
  createdAt: number;
}

export interface WeeklyUsage {
  userId: string;
  weekStart: number;
  freeMessages: number;
  standardMessages: number;
  premiumMessages: number;
  totalCreditsUsed: number;
  updatedAt: number;
}

export interface ModelCost {
  modelSlug: string;
  displayName: string;
  tier: "free" | "standard" | "premium" | "reasoning";
  creditsPerMessage: number;
}

// ── Constants ─────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: {
    creditsMonthly: 0,
    memoryCap: 50,
    sessionSync: false,
    memoryConsolidation: false,
  },
  pro: {
    creditsMonthly: 2000,
    memoryCap: 100,
    sessionSync: true,
    memoryConsolidation: true,
  },
} as const;

/** Get the current week start (Monday 00:00 UTC) as unix timestamp */
export function getWeekStart(): number {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return Math.floor(monday.getTime() / 1000);
}

/** Get the cost in credits for a model */
export function getModelCost(costs: ModelCost[], modelSlug: string): ModelCost | undefined {
  // Try exact match first
  const exact = costs.find((c) => c.modelSlug === modelSlug);
  if (exact) return exact;

  // Try prefix match (e.g., "openrouter/free" matches "openrouter/free")
  const prefix = costs.find((c) => modelSlug.startsWith(c.modelSlug.split(":")[0]));
  if (prefix) return prefix;

  // Default: standard tier cost for unknown models
  return costs.find((c) => c.modelSlug === "openai/gpt-4o-mini");
}

/** Check if a user can afford a message on a given model */
export function canAfford(
  sub: UserSubscription | null,
  cost: ModelCost,
  hasOwnKey: boolean,
): { allowed: boolean; reason?: string } {
  // Free models are always allowed
  if (cost.tier === "free" || cost.creditsPerMessage === 0) {
    return { allowed: true };
  }

  // BYOK users bypass credit checks
  if (hasOwnKey) {
    return { allowed: true };
  }

  // No subscription = no premium models
  if (!sub || sub.plan === "free") {
    return {
      allowed: false,
      reason: "Premium models require a Pro plan. Upgrade to access.",
    };
  }

  // Check credit balance
  if (sub.creditsBalance < cost.creditsPerMessage) {
    return {
      allowed: false,
      reason: `Insufficient credits. You need ${cost.creditsPerMessage} credits but have ${sub.creditsBalance}.`,
    };
  }

  return { allowed: true };
}

// ── D1 Operations ──────────────────────────────────────────────

/** Get or create a user's subscription */
export async function getOrCreateSubscription(
  db: D1Database,
  userId: string,
): Promise<UserSubscription> {
  const existing = await db
    .prepare("SELECT * FROM user_subscriptions WHERE user_id = ?")
    .bind(userId)
    .first() as UserSubscription | null;

  if (existing) return existing;

  // Create free tier subscription
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO user_subscriptions (user_id, plan, credits_balance, credits_monthly, current_period_start, current_period_end, created_at, updated_at) VALUES (?, 'free', 0, 0, ?, ?, ?, ?)"
    )
    .bind(userId, now, now + 30 * 24 * 3600, now, now)
    .run();

  return {
    userId,
    plan: "free",
    creditsBalance: 0,
    creditsMonthly: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodStart: now,
    currentPeriodEnd: now + 30 * 24 * 3600,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deduct credits for a message and record the transaction */
export async function deductCredits(
  db: D1Database,
  userId: string,
  amount: number,
  model: string,
  sessionId: string,
  description: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  // Atomic deduct: only succeed if balance >= amount
  const result = await db
    .prepare(
      "UPDATE user_subscriptions SET credits_balance = credits_balance - ?, updated_at = ? WHERE user_id = ? AND credits_balance >= ?"
    )
    .bind(amount, now, userId, amount)
    .run();

  if (!result.meta?.changes || result.meta.changes === 0) {
    return false; // Insufficient credits
  }

  // Get updated balance
  const updated = await db
    .prepare("SELECT credits_balance FROM user_subscriptions WHERE user_id = ?")
    .bind(userId)
    .first() as { credits_balance: number } | null;

  // Record transaction
  await db
    .prepare(
      "INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description, model, session_id, created_at) VALUES (?, ?, ?, ?, 'usage', ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), userId, -amount, updated?.credits_balance ?? 0, description, model, sessionId, now)
    .run();

  // Update weekly usage
  await incrementWeeklyUsage(db, userId, model, amount);

  return true;
}

/** Grant credits (monthly allocation, purchase, or admin adjustment) */
export async function grantCredits(
  db: D1Database,
  userId: string,
  amount: number,
  type: "grant" | "purchase" | "rollover",
  description: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare("UPDATE user_subscriptions SET credits_balance = credits_balance + ?, updated_at = ? WHERE user_id = ?")
    .bind(amount, now, userId)
    .run();

  const updated = await db
    .prepare("SELECT credits_balance FROM user_subscriptions WHERE user_id = ?")
    .bind(userId)
    .first() as { credits_balance: number } | null;

  await db
    .prepare(
      "INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description, model, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)"
    )
    .bind(crypto.randomUUID(), userId, amount, updated?.credits_balance ?? amount, type, description, now)
    .run();
}

/** Increment weekly usage counters */
async function incrementWeeklyUsage(
  db: D1Database,
  userId: string,
  model: string,
  creditsUsed: number,
): Promise<void> {
  const weekStart = getWeekStart();
  const now = Math.floor(Date.now() / 1000);

  // Get model tier
  const modelCosts = await db.prepare("SELECT * FROM model_costs").all();
  const cost = getModelCost((modelCosts.results as unknown) as ModelCost[], model);
  const tier = cost?.tier ?? "standard";

  const column = tier === "free" ? "free_messages"
    : tier === "premium" || tier === "reasoning" ? "premium_messages"
    : "standard_messages";

  // Upsert weekly usage
  await db
    .prepare(
      `INSERT INTO weekly_usage (user_id, week_start, ${column}, total_credits_used, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE SET
         ${column} = ${column} + 1,
         total_credits_used = total_credits_used + ?,
         updated_at = ?`,
    )
    .bind(userId, weekStart, creditsUsed, now, creditsUsed, now)
    .run();
}

/** Get weekly usage for the current week */
export async function getWeeklyUsage(
  db: D1Database,
  userId: string,
): Promise<WeeklyUsage | null> {
  const weekStart = getWeekStart();
  return await db
    .prepare("SELECT * FROM weekly_usage WHERE user_id = ? AND week_start = ?")
    .bind(userId, weekStart)
    .first() as WeeklyUsage | null;
}

/** Check if user has an active subscription */
export function isActive(sub: UserSubscription): boolean {
  if (sub.plan === "free") return false;
  return sub.currentPeriodEnd > Math.floor(Date.now() / 1000);
}

/** Get all model costs */
export async function getModelCosts(db: D1Database): Promise<ModelCost[]> {
  const results = await db.prepare("SELECT * FROM model_costs ORDER BY credits_per_message ASC").all();
  return (results.results as unknown as ModelCost[]);
}