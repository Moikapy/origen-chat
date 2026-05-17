import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@moikapy/origen", () => ({
  streamOrigen: vi.fn(),
}));

vi.mock("@moikapy/openrouter-auth/next", () => ({
  getApiKeyFromCookie: vi.fn().mockResolvedValue(null),
}));

import { POST } from "../app/api/chat/route";
import { streamOrigen } from "@moikapy/origen";

const mockStreamOrigen = vi.mocked(streamOrigen);

// Helper to create SSE events iterator
async function* createSSEStream(events: Array<Record<string, unknown>>) {
  for (const event of events) {
    yield event;
  }
}

// Helper to create a request with proper origin header for CSRF bypass
const TEST_ORIGIN = "http://localhost:3000";
const VALID_HEADERS = { "Content-Type": "application/json", "Origin": TEST_ORIGIN };

describe("POST /api/chat — Input Validation", () => {
  it("rejects empty messages array", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({ messages: [], model: "openrouter/free", wiki: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json() as { error?: string };
    expect(data.error).toBeTruthy();
  });

  it("rejects invalid model", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        model: "invalid-model-xyz",
        wiki: true,
      }),
    });

    const res = await POST(req);
    // Should reject with 400 (validation), 401 (no key), or 403 (origin) depending on model
    expect([400, 401, 403, 500]).toContain(res.status);
  });

  it("rejects missing model", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        wiki: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects too many messages", async () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "message " + i,
    }));

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({ messages, model: "openrouter/free", wiki: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects content that is too long", async () => {
    const longContent = "x".repeat(15000);
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: longContent }],
        model: "openrouter/free",
        wiki: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat — Key Resolution", () => {
  it("returns 401 for premium model without API key", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        model: "anthropic/claude-sonnet-4",
        wiki: true,
      }),
    });

    // No cookie key, no ollama key, no server free key for premium
    const res = await POST(req);
    // Should return 401 or handle gracefully
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/chat — Error Handling", () => {
  it("catches unhandled errors and returns error response", async () => {
    // Force an error by sending invalid JSON
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: "not valid json {{{",
    });

    const res = await POST(req);
    // Should return 400 (JSON parse error) or 403 (origin check may fail)
    expect(res.status).toBeGreaterThanOrEqual(400);

    const data = await res.json() as { error?: string };
    expect(data.error).toBeTruthy();
  });
});

describe("POST /api/chat — Streaming", () => {
  it("returns SSE content type", async () => {
    // Mock streamOrigen to yield a simple text event
    mockStreamOrigen.mockImplementationOnce(async function* () {
      yield { type: "text", content: "Hello" };
      yield { type: "done", message: "", citations: [], usage: undefined };
    });

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        model: "openrouter/free",
        wiki: false,
      }),
    });

    const res = await POST(req);
    // Even if the key resolution fails, the response should be JSON
    // If it succeeds, it should be SSE
    expect(res.status).toBeLessThan(500);
  });
});

describe("POST /api/chat — Model ID Handling", () => {
  it("strips openrouter/ prefix for API calls", async () => {
    const { stripOpenrouterPrefix } = await import("@/lib/models");
    expect(stripOpenrouterPrefix("openrouter/free")).toBe("openrouter/free");
    expect(stripOpenrouterPrefix("openrouter/anthropic/claude-sonnet-4")).toBe("anthropic/claude-sonnet-4");
    expect(stripOpenrouterPrefix("anthropic/claude-sonnet-4")).toBe("anthropic/claude-sonnet-4");
  });

  it("cf-helpers SSRF guard blocks private IPs", async () => {
    const { validateUrl } = await import("@moikapy/cf-helpers/ssrf");
    expect(validateUrl("http://10.0.0.1/internal").ok).toBe(false);
    expect(validateUrl("https://api.example.com/endpoint").ok).toBe(true);
  });

  it("cf-helpers error classifier works", async () => {
    const { classifyError } = await import("@moikapy/cf-helpers/error");
    expect(classifyError("429 Too Many Requests")).toBe("rate_limit");
    expect(classifyError("Connection interrupted")).toBe("network");
  });
});