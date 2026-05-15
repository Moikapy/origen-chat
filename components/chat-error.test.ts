import { describe, it, expect } from "vitest";
import { classifyError } from "@moikapy/cf-helpers/error";

describe("classifyError", () => {
  it("classifies rate limit errors", () => {
    expect(classifyError("Rate limit reached")).toBe("rate_limit");
    expect(classifyError("429 Too Many Requests")).toBe("rate_limit");
    expect(classifyError("free-models-per-min exceeded")).toBe("rate_limit");
    expect(classifyError("You hit the rate limit")).toBe("rate_limit");
  });

  it("classifies network errors", () => {
    expect(classifyError("Network error")).toBe("network");
    expect(classifyError("Failed to fetch")).toBe("network");
    expect(classifyError("Connection interrupted")).toBe("network");
    expect(classifyError("body stream already read")).toBe("network");
  });

  it("classifies auth errors", () => {
    expect(classifyError("No API key")).toBe("auth");
    expect(classifyError("Sign in for access")).toBe("auth");
    expect(classifyError("401 Unauthorized")).toBe("auth");
  });

  it("classifies general errors as fallback", () => {
    expect(classifyError("Something went wrong")).toBe("general");
    expect(classifyError("Unknown error")).toBe("general");
    expect(classifyError("")).toBe("general");
  });

  it("is case-insensitive", () => {
    expect(classifyError("RATE LIMIT")).toBe("rate_limit");
    expect(classifyError("Network Error")).toBe("network");
    expect(classifyError("Sign In Required")).toBe("auth");
  });
});