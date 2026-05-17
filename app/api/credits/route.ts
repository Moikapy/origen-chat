import { getSessionId, getEnv } from "@/lib/api-utils";
import {
  getOrCreateSubscription,
  getWeeklyUsage,
  getModelCosts,
  isActive,
  canAfford,
  getModelCost,
  deductCredits,
  grantCredits,
  type ModelCost,
} from "@/lib/credits";
import { requireOrigin } from "@/lib/origin-guard";
import { sanitizeError } from "@/lib/sanitize-error";

// ── Auth helper ────────────────────────────────────────────────

async function authenticate(request: Request): Promise<{ userId: string; env: any } | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;

  const env = await getEnv();
  if (!env.DB) return null;

  const { getSession } = await import("@moikapy/magic-link");
  const result = await getSession(sessionId, {
    db: env.DB,
    encryptKey: env.OPENROUTER_ENCRYPT_KEY,
  });

  if (!result?.user?.id) return null;
  return { userId: result.user.id, env };
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// ── GET /api/credits — balance + usage ──────────────────────────

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized();

  try {
    const db = auth.env.DB as D1Database;
    const sub = await getOrCreateSubscription(db, auth.userId);
    const usage = await getWeeklyUsage(db, auth.userId);
    const modelCosts = await getModelCosts(db);

    return Response.json({
      plan: sub.plan,
      creditsBalance: sub.creditsBalance,
      creditsMonthly: sub.creditsMonthly,
      active: isActive(sub),
      currentPeriodEnd: sub.currentPeriodEnd,
      weeklyUsage: {
        freeMessages: usage?.freeMessages ?? 0,
        standardMessages: usage?.standardMessages ?? 0,
        premiumMessages: usage?.premiumMessages ?? 0,
        totalCreditsUsed: usage?.totalCreditsUsed ?? 0,
      },
      modelCosts: modelCosts.map((c: ModelCost) => ({
        slug: c.modelSlug,
        name: c.displayName,
        tier: c.tier,
        credits: c.creditsPerMessage,
      })),
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "credits/balance");
    return Response.json({ error: message }, { status });
  }
}

// ── POST /api/credits/check — can the user afford a model? ──────

export async function POST(request: Request) {
  try {
    // Require valid origin for mutation checks
    const originError = requireOrigin(request);
    if (originError) return originError;

    const auth = await authenticate(request);
    if (!auth) return unauthorized();

    const body = (await request.json()) as { model?: string; hasOwnKey?: boolean };
    if (!body.model) {
      return Response.json({ error: "model is required" }, { status: 400 });
    }

    const db = auth.env.DB as D1Database;
    const sub = await getOrCreateSubscription(db, auth.userId);
    const modelCosts = await getModelCosts(db);
    const cost = getModelCost(modelCosts, body.model);

    if (!cost) {
      return Response.json({ allowed: false, reason: "Unknown model" }, { status: 400 });
    }

    const check = canAfford(sub, cost, body.hasOwnKey ?? false);
    return Response.json({
      ...check,
      model: body.model,
      creditsRequired: cost.creditsPerMessage,
      creditsBalance: sub.creditsBalance,
      tier: cost.tier,
    });
  } catch (err) {
    const { message, status } = sanitizeError(err, "credits/check");
    return Response.json({ error: message }, { status });
  }
}