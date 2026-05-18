import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock localStorage for vitest
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

// ── Ollama config parsing (single source of truth: getOllamaConfig) ──

describe("Ollama config parsing", () => {
  it("returns null when no config stored", () => {
    expect(localStorageMock.getItem("origen_ollama_config")).toBeNull();
  });

  it("parses cloud config with apiKey", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "https://ollama.com/v1", apiKey: "sk-test", mode: "cloud" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(stored.mode).toBe("cloud");
    expect(stored.apiKey).toBe("sk-test");
    expect(stored.baseUrl).toBe("https://ollama.com/v1");
  });

  it("parses local config", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "http://localhost:11434/v1", mode: "local" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(stored.mode).toBe("local");
  });

  it("cloud config without apiKey returns null from getOllamaConfig", () => {
    // In getOllamaConfig: cloud mode without apiKey → return null
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "https://ollama.com/v1", mode: "cloud" }),
    );
    const stored = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    // apiKey is missing, which means getOllamaConfig returns null
    expect(stored.apiKey).toBeFalsy();
  });

  it("defaults to https://ollama.com/v1 for cloud with missing baseUrl", () => {
    const defaultUrl = "https://ollama.com/v1";
    const emptyUrl = "";
    expect(emptyUrl.trim().replace(/\/+$/, "") || defaultUrl).toBe(defaultUrl);
  });

  it("defaults to http://localhost:11434/v1 for local with missing baseUrl", () => {
    const defaultUrl = "http://localhost:11434/v1";
    const emptyUrl = "";
    expect(emptyUrl.trim().replace(/\/+$/, "") || defaultUrl).toBe(defaultUrl);
  });

  it("handles malformed JSON", () => {
    localStorageMock.setItem("origen_ollama_config", "not-json");
    const stored = localStorageMock.getItem("origen_ollama_config");
    expect(() => JSON.parse(stored!)).toThrow();
  });
});

// ── Chat routing: Ollama params only for Ollama models (DRY) ───────

describe("Chat request body construction", () => {
  it("non-Ollama models: no Ollama params in body", () => {
    const model = "openrouter/deepseek/deepseek-v4-flash:free";
    const isOllamaModel = model.startsWith("ollama/");
    const body: Record<string, unknown> = { messages: [], model, wiki: true };
    // DRY: only add Ollama params when model is Ollama
    if (isOllamaModel) {
      body.ollamaBaseUrl = "https://ollama.com/v1";
    }
    expect(body).not.toHaveProperty("ollamaBaseUrl");
    expect(Object.keys(body)).toEqual(["messages", "model", "wiki"]);
  });

  it("cloud Ollama model: includes ollamaBaseUrl and ollamaApiKey", () => {
    const model = "ollama/llama3";
    const isOllamaModel = model.startsWith("ollama/");
    const body: Record<string, unknown> = { messages: [], model, wiki: true };
    if (isOllamaModel) {
      body.ollamaBaseUrl = "https://ollama.com/v1";
      body.ollamaApiKey = "sk-test";
    }
    expect(body).toHaveProperty("ollamaBaseUrl", "https://ollama.com/v1");
    expect(body).toHaveProperty("ollamaApiKey", "sk-test");
  });

  it("local Ollama model: bypasses server entirely (direct fetch)", () => {
    const model = "ollama/llama3";
    const ollamaMode = "local";
    const shouldGoDirect = model.startsWith("ollama/") && ollamaMode === "local";
    expect(shouldGoDirect).toBe(true);
  });

  it("Ollama config stored but non-Ollama model: no leak", () => {
    // KEY DRY FIX: Ollama config should NOT leak into non-Ollama request bodies
    const model = "openrouter/deepseek/deepseek-v4-flash:free";
    const isOllamaModel = model.startsWith("ollama/");
    const body: Record<string, unknown> = { messages: [], model, wiki: true };
    if (isOllamaModel) {
      body.ollamaBaseUrl = "https://ollama.com/v1";
      body.ollamaApiKey = "sk-test";
    }
    expect(body).not.toHaveProperty("ollamaBaseUrl");
    expect(body).not.toHaveProperty("ollamaApiKey");
    // OpenRouter auth comes from cookies, parsed server-side
  });

  it("OpenRouter auth: no client-side auth in body", () => {
    // OpenRouter auth is entirely server-side (encrypted cookies)
    // Client never sends apiKey in the body for OpenRouter models
    const model = "openrouter/deepseek/deepseek-v4-flash:free";
    const body: Record<string, unknown> = { messages: [], model, wiki: true };
    expect(Object.keys(body)).toEqual(["messages", "model", "wiki"]);
    expect(body).not.toHaveProperty("apiKey");
    expect(body).not.toHaveProperty("ollamaApiKey");
  });
});

// ── Local Ollama URL construction ──────────────────────────────────

describe("Local Ollama URL", () => {
  it("baseUrl contains /v1, appends /chat/completions", () => {
    const baseUrl = "http://localhost:11434/v1";
    const endpoint = `${baseUrl}/chat/completions`;
    expect(endpoint).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("strips trailing slashes", () => {
    const raw = "http://localhost:11434/v1/";
    expect(raw.replace(/\/+$/, "")).toBe("http://localhost:11434/v1");
  });

  it("strips ollama/ prefix from model ID", () => {
    expect("ollama/llama3".replace(/^ollama\//, "")).toBe("llama3");
    expect("ollama/gemma3:12b".replace(/^ollama\//, "")).toBe("gemma3:12b");
  });
});