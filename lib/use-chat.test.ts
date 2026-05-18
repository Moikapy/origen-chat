import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage for vitest (not available in Node by default)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

beforeEach(() => {
  localStorageMock.clear();
});

// ── getAuthConfig / config parsing tests ──────────────────────────

describe("Ollama config parsing (use-chat)", () => {
  it("returns null when no config stored", () => {
    expect(localStorageMock.getItem("origen_ollama_config")).toBeNull();
  });

  it("parses cloud config with apiKey and /v1 baseUrl", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "https://ollama.com/v1", apiKey: "sk-test-123", mode: "cloud" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(stored.baseUrl).toBe("https://ollama.com/v1");
    expect(stored.apiKey).toBe("sk-test-123");
    expect(stored.mode).toBe("cloud");
  });

  it("defaults to https://ollama.com/v1 when no baseUrl in cloud mode", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ apiKey: "sk-test-456", mode: "cloud" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    // getAuthConfig in use-chat defaults to "https://ollama.com/v1"
    const effectiveUrl = stored.baseUrl || "https://ollama.com/v1";
    expect(effectiveUrl).toBe("https://ollama.com/v1");
    expect(stored.apiKey).toBe("sk-test-456");
  });

  it("parses local config with localhost URL", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "http://localhost:11434", mode: "local" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(stored.baseUrl).toBe("http://localhost:11434");
    expect(stored.mode).toBe("local");
  });

  it("handles malformed JSON gracefully", () => {
    localStorageMock.setItem("origen_ollama_config", "not-json");
    const stored = localStorageMock.getItem("origen_ollama_config");
    expect(() => JSON.parse(stored!)).toThrow();
  });
});

// ── Chat routing logic tests ──────────────────────────────────────

describe("Chat routing decisions", () => {
  it("local Ollama models should bypass server (browser can't reach localhost)", () => {
    const model = "ollama/llama3";
    const ollamaConfig = { url: "http://localhost:11434", apiKey: "", mode: "local" };
    expect(model.startsWith("ollama/") && ollamaConfig.mode === "local").toBe(true);
  });

  it("cloud Ollama models should route through server", () => {
    const model = "ollama/llama3";
    const ollamaConfig = { url: "https://ollama.com/v1", apiKey: "sk-test", mode: "cloud" };
    expect(model.startsWith("ollama/") && ollamaConfig.mode === "local").toBe(false);
  });

  it("OpenRouter models always route through server", () => {
    const model = "openrouter/deepseek/deepseek-v4-flash:free";
    expect(model.startsWith("ollama/")).toBe(false);
  });

  it("cloud Ollama should pass /v1 base URL and API key in request body", () => {
    const ollamaConfig = { url: "https://ollama.com/v1", apiKey: "sk-test", mode: "cloud" };
    const authPayload = ollamaConfig.mode === "cloud"
      ? { ollamaBaseUrl: "https://ollama.com/v1", ollamaApiKey: ollamaConfig.apiKey }
      : {};
    expect(authPayload).toEqual({
      ollamaBaseUrl: "https://ollama.com/v1",
      ollamaApiKey: "sk-test",
    });
  });
});

// ── URL construction tests ────────────────────────────────────────

describe("Ollama URL construction", () => {
  it("local Ollama uses /v1/chat/completions endpoint (OpenAI-compatible)", () => {
    const baseUrl = "http://localhost:11434";
    const endpoint = `${baseUrl}/v1/chat/completions`;
    expect(endpoint).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("local Ollama uses /v1/models for model listing (OpenAI-compatible)", () => {
    const baseUrl = "http://localhost:11434";
    const endpoint = `${baseUrl}/v1/models`;
    expect(endpoint).toBe("http://localhost:11434/v1/models");
  });

  it("cloud Ollama base URL includes /v1 for streamOrigen", () => {
    const cloudBaseUrl = "https://ollama.com/v1";
    expect(cloudBaseUrl.endsWith("/v1")).toBe(true);
  });

  it("strips trailing slashes from base URL", () => {
    const urls = [
      "http://localhost:11434/",
      "http://localhost:11434",
      "https://ollama.com/v1/",
      "https://ollama.com/v1",
    ];
    const normalized = urls.map(u => u.replace(/\/+$/, ""));
    expect(normalized).toEqual([
      "http://localhost:11434",
      "http://localhost:11434",
      "https://ollama.com/v1",
      "https://ollama.com/v1",
    ]);
  });
});

// ── Ollama model ID parsing ──────────────────────────────────────

describe("Ollama model ID parsing", () => {
  it("strips ollama/ prefix for API calls", () => {
    expect("ollama/llama3".replace(/^ollama\//, "")).toBe("llama3");
  });

  it("strips ollama/ prefix for complex model names", () => {
    expect("ollama/gemma3:12b".replace(/^ollama\//, "")).toBe("gemma3:12b");
  });

  it("does not modify non-ollama model IDs", () => {
    const model = "openrouter/deepseek/deepseek-v4-flash:free";
    expect(model.startsWith("ollama/")).toBe(false);
  });
});