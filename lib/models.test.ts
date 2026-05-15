import { describe, it, expect } from "vitest";
import { stripOpenrouterPrefix as getModelFromSlug, getProviderBadge } from "./models";

describe("stripOpenrouterPrefix (getModelFromSlug)", () => {
  it("returns model slug without openrouter prefix for API calls", () => {
    expect(getModelFromSlug("openrouter/deepseek/deepseek-v4-flash:free"))
      .toBe("deepseek/deepseek-v4-flash:free");
  });

  it("keeps openrouter/free as-is since it's a router endpoint", () => {
    expect(getModelFromSlug("openrouter/free")).toBe("openrouter/free");
  });

  it("handles models with single segment after openrouter/", () => {
    expect(getModelFromSlug("openrouter/openai/gpt-4o"))
      .toBe("openai/gpt-4o");
  });

  it("returns slug as-is if no openrouter prefix", () => {
    expect(getModelFromSlug("deepseek/deepseek-v4-flash:free"))
      .toBe("deepseek/deepseek-v4-flash:free");
  });
});

describe("getProviderBadge", () => {
  it("returns Anthropic badge for anthropic models", () => {
    expect(getProviderBadge("openrouter/anthropic/claude-sonnet-4"))
      .toEqual({ text: "ANT", color: "bg-orange-500/20 text-orange-400" });
  });

  it("returns OpenAI badge for openai models", () => {
    expect(getProviderBadge("openrouter/openai/gpt-4o"))
      .toEqual({ text: "OAI", color: "bg-green-500/20 text-green-400" });
  });

  it("returns Google badge for google models", () => {
    expect(getProviderBadge("openrouter/google/gemini-3.1-flash-lite"))
      .toEqual({ text: "GOO", color: "bg-blue-500/20 text-blue-400" });
  });

  it("returns DeepSeek badge for deepseek models", () => {
    expect(getProviderBadge("openrouter/deepseek/deepseek-v4-flash:free"))
      .toEqual({ text: "DS", color: "bg-yellow-500/20 text-yellow-400" });
  });

  it("returns Free badge for openrouter/free", () => {
    expect(getProviderBadge("openrouter/free"))
      .toEqual({ text: "FREE", color: "bg-primary/20 text-primary" });
  });

  it("returns generic badge for unknown providers", () => {
    expect(getProviderBadge("openrouter/some-unknown/model"))
      .toEqual({ text: "SOM", color: "bg-muted text-muted-foreground" });
  });

  it("extracts provider from non-openrouter slugs", () => {
    expect(getProviderBadge("anthropic/claude-opus-4"))
      .toEqual({ text: "ANT", color: "bg-orange-500/20 text-orange-400" });
  });
});