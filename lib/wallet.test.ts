import { describe, it, expect } from "vitest";
import { verifySiweMessage, createSiweMessage, canLaunchToken, canClaimRevenue, canPayWithCrypto } from "./wallet";

describe("verifySiweMessage", () => {
  it("rejects messages from wrong domain", async () => {
    const result = await verifySiweMessage("some message", "0xabc123", "wrong-domain.com");
    expect(result).toBeNull();
  });

  it("rejects empty messages", async () => {
    const result = await verifySiweMessage("", "0xabc123", "origen.moikapy.dev");
    expect(result).toBeNull();
  });
});

describe("canLaunchToken", () => {
  it("allows signed-in users to launch tokens", () => {
    const user = { id: "user-1", email: "test@test.com" };
    expect(canLaunchToken(user)).toBe(true);
  });
  it("rejects unauthenticated users", () => { expect(canLaunchToken(null)).toBe(false); });
});

describe("canClaimRevenue", () => {
  it("requires both sign-in and wallet", () => {
    const user = { id: "user-1", email: "test@test.com" };
    expect(canClaimRevenue(user, true)).toBe(true);
    expect(canClaimRevenue(user, false)).toBe(false);
    expect(canClaimRevenue(null, true)).toBe(false);
  });
});

describe("canPayWithCrypto", () => {
  it("requires both sign-in and wallet", () => {
    const user = { id: "user-1", email: "test@test.com" };
    expect(canPayWithCrypto(user, true)).toBe(true);
    expect(canPayWithCrypto(user, false)).toBe(false);
    expect(canPayWithCrypto(null, true)).toBe(false);
  });
});

describe("createSiweMessage", () => {
  it("creates a valid SIWE message with required fields", () => {
    const msg = createSiweMessage({ domain: "origen.moikapy.dev", address: "0x1234567890123456789012345678901234567890", chainId: 8453, nonce: "abc123" });
    expect(msg).toContain("origen.moikapy.dev");
    expect(msg).toContain("0x1234567890123456789012345678901234567890");
    expect(msg).toContain("8453");
    expect(msg).toContain("abc123");
  });
});