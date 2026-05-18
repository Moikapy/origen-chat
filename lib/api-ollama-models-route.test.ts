import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch for the route tests
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { POST } from "../app/api/ollama-models/route";

beforeEach(() => {
  fetchMock.mockReset();
});

// Helper to create a request
const VALID_HEADERS = { "Content-Type": "application/json" };

describe("POST /api/ollama-models", () => {
  it("requires baseUrl in request body", async () => {
    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({}),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);

    const data = await res.json() as { error: string };
    expect(data.error).toContain("baseUrl");
  });

  it("proxies cloud Ollama /v1/models request", async () => {
    const mockModels = {
      data: [
        { id: "llama3" },
        { id: "gemma3:12b" },
      ],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockModels,
    });

    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        baseUrl: "https://ollama.com/v1",
        apiKey: "sk-test-key",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const data = await res.json() as { data: Array<{ id: string }> };
    expect(data.data).toHaveLength(2);
    expect(data.data[0].id).toBe("llama3");

    // Verify fetch was called with the right URL and headers
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
      }),
    );
  });

  it("proxies local Ollama /v1/models request (no auth)", async () => {
    const mockModels = {
      models: [
        { name: "llama3", size: 4661224676, modified_at: "2024-05-01" },
      ],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockModels,
    });

    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        baseUrl: "http://localhost:11434/v1",
        apiKey: "",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    // Verify fetch was called without Authorization header
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.objectContaining({
        headers: {},
      }),
    );
  });

  it("strips trailing slashes from baseUrl", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        baseUrl: "https://ollama.com/v1/",
      }),
    });

    await POST(req as any);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ollama.com/v1/models",
      expect.anything(),
    );
  });

  it("returns 502 when Ollama is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        baseUrl: "http://localhost:11434/v1",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(502);

    const data = await res.json() as { error: string };
    expect(data.error).toContain("Failed to fetch");
  });

  it("passes through Ollama 401 errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid api key" }),
    });

    const req = new Request("http://localhost/api/ollama-models", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({
        baseUrl: "https://ollama.com/v1",
        apiKey: "sk-invalid",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });
});