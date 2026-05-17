import { describe, it, expect } from "vitest";
import { verifyUsdcPayment, usdToCredits, CREDITS_PER_DOLLAR, PLATFORM_SPREAD, USDC_BASE_CONTRACT, PRO_PRICE_CENTS } from "./crypto-payments";

describe("verifyUsdcPayment", () => {
  it("rejects empty tx hash", async () => {
    const result = await verifyUsdcPayment("", "0xTreasury", "https://mainnet.base.org");
    expect(result.verified).toBe(false);
    expect(result.reason).toContain("required");
  });

  it("validates USDC contract address format", () => {
    expect(USDC_BASE_CONTRACT).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });
});

describe("usdToCredits", () => {
  it("converts USD cents to credits with platform spread", () => {
    const credits = usdToCredits(500);
    expect(credits).toBe(Math.floor(500 * (1 - PLATFORM_SPREAD)));
  });

  it("converts ETH price to credits", () => {
    const credits = usdToCredits(3500);
    expect(credits).toBe(Math.floor(3500 * (1 - PLATFORM_SPREAD)));
  });

  it("rounds down to integer credits", () => {
    const credits = usdToCredits(1);
    expect(Number.isInteger(credits)).toBe(true);
  });

  it("CREDITS_PER_DOLLAR is 100", () => { expect(CREDITS_PER_DOLLAR).toBe(100); });
  it("PLATFORM_SPREAD is 3%", () => { expect(PLATFORM_SPREAD).toBe(0.03); });
});

describe("PRO_PRICE_CENTS", () => {
  it("Pro costs $5 = 500 cents", () => { expect(PRO_PRICE_CENTS).toBe(500); });
  it("Pro yields 485 credits after spread", () => { expect(usdToCredits(PRO_PRICE_CENTS)).toBe(485); });
});