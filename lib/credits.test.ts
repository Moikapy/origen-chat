import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS,
  getWeekStart,
  getModelCost,
  canAfford,
  type ModelCost,
  type UserSubscription,
} from "./credits";

const MODEL_COSTS: ModelCost[] = [
  { modelSlug: "openrouter/free", displayName: "Free Models Router", tier: "free", creditsPerMessage: 0 },
  { modelSlug: "openai/gpt-4o-mini", displayName: "GPT-4o Mini", tier: "standard", creditsPerMessage: 3 },
  { modelSlug: "openai/gpt-4o", displayName: "GPT-4o", tier: "premium", creditsPerMessage: 10 },
  { modelSlug: "anthropic/claude-opus-4-5", displayName: "Claude Opus 4.5", tier: "premium", creditsPerMessage: 25 },
];

describe("credits", () => {
  describe("getWeekStart", () => {
    it("returns a Monday timestamp", () => {
      const weekStart = getWeekStart();
      const date = new Date(weekStart * 1000);
      expect(date.getUTCDay()).toBe(1); // Monday
      expect(date.getUTCHours()).toBe(0);
    });

    it("returns the same week for any day in the same week", () => {
      const week1 = getWeekStart();
      const week2 = getWeekStart();
      expect(week2).toBe(week1);
    });
  });

  describe("getModelCost", () => {
    it("finds exact model match", () => {
      const cost = getModelCost(MODEL_COSTS, "openai/gpt-4o");
      expect(cost?.creditsPerMessage).toBe(10);
    });

    it("finds free model", () => {
      const cost = getModelCost(MODEL_COSTS, "openrouter/free");
      expect(cost?.tier).toBe("free");
      expect(cost?.creditsPerMessage).toBe(0);
    });

    it("falls back to default for unknown models", () => {
      const cost = getModelCost(MODEL_COSTS, "unknown-model");
      expect(cost?.creditsPerMessage).toBe(3); // gpt-4o-mini default
    });

    it("matches by prefix for variant models", () => {
      const cost = getModelCost(MODEL_COSTS, "openai/gpt-4o-2024-08-06");
      expect(cost?.creditsPerMessage).toBe(10); // matches gpt-4o prefix
    });
  });

  describe("canAfford", () => {
    const freeCost = MODEL_COSTS[0]; // free
    const standardCost = MODEL_COSTS[1]; // 3 credits
    const premiumCost = MODEL_COSTS[2]; // 10 credits

    it("always allows free models", () => {
      const result = canAfford(null, freeCost, false);
      expect(result.allowed).toBe(true);
    });

    it("blocks premium models for free users", () => {
      const freeSub: UserSubscription = {
        userId: "u1",
        plan: "free",
        creditsBalance: 0,
        creditsMonthly: 0,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: 0,
        currentPeriodEnd: 0,
        createdAt: 0,
        updatedAt: 0,
      };
      const result = canAfford(freeSub, premiumCost, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Pro plan");
    });

    it("allows premium models for pro users with enough credits", () => {
      const proSub: UserSubscription = {
        userId: "u1",
        plan: "pro",
        creditsBalance: 2000,
        creditsMonthly: 2000,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        currentPeriodStart: Math.floor(Date.now() / 1000) - 86400,
        currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
        createdAt: Math.floor(Date.now() / 1000) - 86400,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      const result = canAfford(proSub, premiumCost, false);
      expect(result.allowed).toBe(true);
    });

    it("blocks when insufficient credits", () => {
      const proSub: UserSubscription = {
        userId: "u1",
        plan: "pro",
        creditsBalance: 5,
        creditsMonthly: 2000,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        currentPeriodStart: Math.floor(Date.now() / 1000) - 86400,
        currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 86400,
        createdAt: Math.floor(Date.now() / 1000) - 86400,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      const result = canAfford(proSub, premiumCost, false); // needs 10, has 5
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Insufficient");
    });

    it("allows BYOK users to bypass credit checks", () => {
      const result = canAfford(null, premiumCost, true);
      expect(result.allowed).toBe(true);
    });
  });

  describe("PLAN_LIMITS", () => {
    it("free tier has no credits", () => {
      expect(PLAN_LIMITS.free.creditsMonthly).toBe(0);
      expect(PLAN_LIMITS.free.sessionSync).toBe(false);
    });

    it("pro tier has 2000 credits", () => {
      expect(PLAN_LIMITS.pro.creditsMonthly).toBe(2000);
      expect(PLAN_LIMITS.pro.sessionSync).toBe(true);
    });
  });
});