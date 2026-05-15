import { describe, it, expect } from "vitest";
import {
  validateChatRequest,
  isPrivateIP,
  sanitizeOllamaUrl,
  MODEL_WHITELIST,
} from "./security";

describe("validateChatRequest", () => {
  it("rejects empty messages array", () => {
    const result = validateChatRequest({ messages: [], model: "openrouter/free", wiki: false });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/i);
  });

  it("rejects too many messages", () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const result = validateChatRequest({ messages, model: "openrouter/free", wiki: false });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too many/i);
  });

  it("rejects message content over 10KB", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "x".repeat(10_001) }],
      model: "openrouter/free",
      wiki: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  it("rejects invalid model", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/anthropic/claude-opus-4-haxx",
      wiki: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid model/i);
  });

  it("accepts valid free model request", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts valid premium model request", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/anthropic/claude-sonnet-4",
      wiki: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = validateChatRequest({
      messages: [{ role: "system", content: "hack" }],
      model: "openrouter/free",
      wiki: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid role/i);
  });

  it("rejects SSRF ollama URL pointing to AWS metadata", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaBaseUrl: "http://169.254.169.254/latest/meta-data/",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ollama/i);
  });

  it("rejects ollama URL pointing to localhost", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaBaseUrl: "http://localhost:11434",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts valid ollama URL", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaBaseUrl: "https://ollama.example.com",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty ollamaApiKey", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaApiKey: "",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/api key/i);
  });

  it("rejects overly long ollamaApiKey", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaApiKey: "x".repeat(201),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  it("accepts valid ollamaApiKey", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "hello" }],
      model: "openrouter/free",
      wiki: false,
      ollamaApiKey: "sk-valid-key-123",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects non-string content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: 42 as any }],
      model: "openrouter/free",
      wiki: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/must be a string/i);
  });
});

describe("isPrivateIP", () => {
  it("blocks 127.0.0.1", () => expect(isPrivateIP("127.0.0.1")).toBe(true));
  it("blocks 10.0.0.1", () => expect(isPrivateIP("10.0.0.1")).toBe(true));
  it("blocks 172.16.0.1", () => expect(isPrivateIP("172.16.0.1")).toBe(true));
  it("blocks 172.31.255.255", () => expect(isPrivateIP("172.31.255.255")).toBe(true));
  it("allows 172.15.0.1", () => expect(isPrivateIP("172.15.0.1")).toBe(false));
  it("allows 172.32.0.1", () => expect(isPrivateIP("172.32.0.1")).toBe(false));
  it("blocks 192.168.1.1", () => expect(isPrivateIP("192.168.1.1")).toBe(true));
  it("blocks 169.254.169.254 (AWS metadata)", () => expect(isPrivateIP("169.254.169.254")).toBe(true));
  it("blocks 0.0.0.0", () => expect(isPrivateIP("0.0.0.0")).toBe(true));
  it("blocks multicast 224.0.0.1", () => expect(isPrivateIP("224.0.0.1")).toBe(true));
  it("allows 1.1.1.1", () => expect(isPrivateIP("1.1.1.1")).toBe(false));
  it("allows 8.8.8.8", () => expect(isPrivateIP("8.8.8.8")).toBe(false));
  it("allows 142.250.80.46", () => expect(isPrivateIP("142.250.80.46")).toBe(false));
  it("blocks malformed IPs", () => expect(isPrivateIP("not-an-ip")).toBe(true));
});

describe("sanitizeOllamaUrl", () => {
  it("rejects http://127.0.0.1:11434", () => {
    const result = sanitizeOllamaUrl("http://127.0.0.1:11434");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private/i);
  });

  it("rejects AWS metadata endpoint", () => {
    const result = sanitizeOllamaUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
  });

  it("rejects non-HTTP protocols", () => {
    const result = sanitizeOllamaUrl("ftp://example.com");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/protocol/i);
  });

  it("rejects .local hostnames", () => {
    const result = sanitizeOllamaUrl("http://myserver.local");
    expect(result.ok).toBe(false);
  });

  it("rejects .internal hostnames", () => {
    const result = sanitizeOllamaUrl("http://myserver.internal");
    expect(result.ok).toBe(false);
  });

  it("accepts https://ollama.example.com", () => {
    const result = sanitizeOllamaUrl("https://ollama.example.com");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://ollama.example.com");
  });

  it("accepts http://localhost when explicitly allowed", () => {
    const result = sanitizeOllamaUrl("http://localhost:11434", { allowLocalhost: true });
    expect(result.ok).toBe(true);
  });

  it("rejects http://localhost by default", () => {
    const result = sanitizeOllamaUrl("http://localhost:11434");
    expect(result.ok).toBe(false);
  });

  it("strips trailing slashes", () => {
    const result = sanitizeOllamaUrl("https://ollama.example.com/");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://ollama.example.com");
  });

  it("rejects invalid URL format", () => {
    const result = sanitizeOllamaUrl("not a url at all");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });
});

describe("MODEL_WHITELIST", () => {
  it("contains free models", () => {
    expect(MODEL_WHITELIST.has("openrouter/free")).toBe(true);
    expect(MODEL_WHITELIST.has("openrouter/deepseek/deepseek-v4-flash:free")).toBe(true);
  });

  it("contains premium models", () => {
    expect(MODEL_WHITELIST.has("openrouter/anthropic/claude-sonnet-4")).toBe(true);
    expect(MODEL_WHITELIST.has("openrouter/openai/gpt-4o")).toBe(true);
  });

  it("does not contain made-up models", () => {
    expect(MODEL_WHITELIST.has("openrouter/anthropic/claude-opus-4-haxx")).toBe(false);
    expect(MODEL_WHITELIST.has("totally-fake-model")).toBe(false);
  });
});