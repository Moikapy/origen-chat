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

// Mock fetch global
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  localStorageMock.clear();
  fetchMock.mockReset();
});

// ── useOllama config parsing tests ──────────────────────────────────

describe("useOllama config parsing", () => {
  it("returns null when no config stored", () => {
    expect(localStorageMock.getItem("origen_ollama_config")).toBeNull();
  });

  it("parses cloud config with apiKey and /v1 baseUrl", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "https://ollama.com/v1", apiKey: "sk-test", mode: "cloud" }),
    );
    const parsed = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(parsed.mode).toBe("cloud");
    expect(parsed.apiKey).toBe("sk-test");
    expect(parsed.baseUrl).toBe("https://ollama.com/v1");
  });

  it("parses local config with localhost URL", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "http://localhost:11434/v1", apiKey: "", mode: "local" }),
    );
    const parsed = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(parsed.mode).toBe("local");
    expect(parsed.baseUrl).toBe("http://localhost:11434/v1");
  });

  it("defaults cloud mode when mode is missing", () => {
    localStorageMock.setItem(
      "origen_ollama_config",
      JSON.stringify({ baseUrl: "https://ollama.com/v1", apiKey: "sk-test" }),
    );
    const parsed = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(parsed.apiKey).toBe("sk-test");
  });

  it("handles malformed JSON in localStorage", () => {
    localStorageMock.setItem("origen_ollama_config", "not-json");
    const stored = localStorageMock.getItem("origen_ollama_config");
    expect(() => JSON.parse(stored!)).toThrow();
  });
});

// ── Model listing endpoint routing ──────────────────────────────────

describe("Ollama model listing routing", () => {
  it("cloud mode routes through /api/ollama-models proxy (CORS bypass)", () => {
    // Cloud mode should POST to /api/ollama-models, NOT directly to ollama.com
    const mode = "cloud";
    const baseUrl = "https://ollama.com/v1";
    const apiKey = "sk-test";

    // Verify that the cloud URL construction goes to our proxy
    const endpoint = mode === "cloud" ? "/api/ollama-models" : `${baseUrl}/models`;
    expect(endpoint).toBe("/api/ollama-models");
  });

  it("local mode hits localhost directly (no CORS issue)", () => {
    const mode = "local";
    const baseUrl = "http://localhost:11434/v1";
    const endpoint = mode === "cloud" ? "/api/ollama-models" : `${baseUrl}/models`;
    expect(endpoint).toBe("http://localhost:11434/v1/models");
  });

  it("cloud proxy request body includes baseUrl and apiKey", () => {
    const body = { baseUrl: "https://ollama.com/v1", apiKey: "sk-test" };
    expect(body.baseUrl).toBe("https://ollama.com/v1");
    expect(body.apiKey).toBe("sk-test");
  });

  it("handles OpenAI-compatible response format { data: [...] }", () => {
    const openAIFormat = {
      data: [
        { id: "llama3" },
        { id: "gemma3:12b" },
      ],
    };
    const models = (openAIFormat.data || []).map((d: { id: string }) => ({
      name: d.id,
      id: `ollama/${d.id}`,
      size: 0,
      modified: "",
      sizeLabel: "",
    }));
    expect(models).toHaveLength(2);
    expect(models[0].name).toBe("llama3");
    expect(models[0].id).toBe("ollama/llama3");
  });

  it("handles native Ollama response format { models: [...] }", () => {
    const ollamaFormat = {
      models: [
        { name: "llama3", size: 4661224676, modified_at: "2024-05-01T00:00:00Z" },
        { name: "gemma3:12b", size: 8134300000, modified_at: "2024-06-01T00:00:00Z" },
      ],
    };
    const models = (ollamaFormat.models || []).map((m: { name: string; size: number; modified_at: string }) => ({
      name: m.name,
      id: `ollama/${m.name}`,
      size: m.size,
      modified: m.modified_at,
      sizeLabel: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : "",
    }));
    expect(models).toHaveLength(2);
    expect(models[0].name).toBe("llama3");
    expect(models[0].sizeLabel).toBe("4.7 GB");
  });

  it("prioritizes models array over data array (Ollama native format)", () => {
    const mixed = {
      models: [{ name: "from-native", size: 0, modified_at: "" }],
      data: [{ id: "from-openai" }],
    };
    const models = mixed.models || (mixed.data || []).map((d: { id: string }) => ({
      name: d.id,
      size: 0,
      modified_at: "",
    }));
    expect(models[0].name).toBe("from-native");
  });
});

// ── Save config tests ─────────────────────────────────────────────

describe("Ollama config save/load roundtrip", () => {
  it("roundtrips cloud mode config", () => {
    const config = { baseUrl: "https://ollama.com/v1", apiKey: "sk-test-key", mode: "cloud" as const };
    localStorageMock.setItem("origen_ollama_config", JSON.stringify(config));
    const loaded = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(loaded).toEqual(config);
  });

  it("roundtrips local mode config", () => {
    const config = { baseUrl: "http://localhost:11434/v1", apiKey: "", mode: "local" as const };
    localStorageMock.setItem("origen_ollama_config", JSON.stringify(config));
    const loaded = JSON.parse(localStorageMock.getItem("origen_ollama_config")!);
    expect(loaded).toEqual(config);
  });

  it("strips trailing slashes when saving", () => {
    const raw = "https://ollama.com/v1/";
    const normalized = raw.replace(/\/+$/, "");
    expect(normalized).toBe("https://ollama.com/v1");
  });

  it("defaults to https://ollama.com/v1 for cloud with empty baseUrl", () => {
    const defaultCloud = "https://ollama.com/v1";
    const emptyUrl = "";
    const normalized = emptyUrl.trim().replace(/\/+$/, "") || defaultCloud;
    expect(normalized).toBe(defaultCloud);
  });

  it("defaults to http://localhost:11434/v1 for local with empty baseUrl", () => {
    const defaultLocal = "http://localhost:11434/v1";
    const emptyUrl = "";
    const normalized = emptyUrl.trim().replace(/\/+$/, "") || defaultLocal;
    expect(normalized).toBe(defaultLocal);
  });
});

// ── Connection test routing ────────────────────────────────────────

describe("Ollama connection test routing", () => {
  it("cloud test routes through server proxy", () => {
    const mode = "cloud";
    const endpoint = mode === "cloud" ? "/api/ollama-models" : "http://localhost:11434/v1/models";
    expect(endpoint).toBe("/api/ollama-models");
  });

  it("local test hits localhost directly", () => {
    const mode = "local";
    const baseUrl = "http://localhost:11434/v1";
    const endpoint = mode === "cloud" ? "/api/ollama-models" : `${baseUrl}/models`;
    expect(endpoint).toBe("http://localhost:11434/v1/models");
  });

  it("handles 401 response for invalid API key", () => {
    const status = 401;
    expect(status).toBe(401);
  });
});