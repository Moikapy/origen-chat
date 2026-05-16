import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  consolidateConversation,
  createD1MemoryProvider,
} from "./consolidate";
import type { MemoryProvider, MemoryFact } from "@moikapy/origen";

// Mock fetch for LLM calls
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("consolidate", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Clear rate limit timestamps
    const timestamps = (consolidateConversation as any).__timestamps;
    if (timestamps) timestamps.clear();
  });

  describe("consolidateConversation", () => {
    const mockMemory: MemoryProvider = {
      getFacts: vi.fn().mockResolvedValue([]),
      saveFact: vi.fn().mockResolvedValue(undefined),
      deleteFact: vi.fn().mockResolvedValue(undefined),
      searchFacts: vi.fn().mockResolvedValue([]),
    };

    it("calls LLM and saves extracted facts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: "name=Moikapy\npreferred_language=TypeScript\nproject=origen-chat",
                },
              },
            ],
          }),
      });

      const messages = [
        { role: "user", content: "Hi, I'm Moikapy. I'm working on origen-chat using TypeScript." },
        { role: "assistant", content: "Nice to meet you, Moikapy!" },
      ];

      const result = await consolidateConversation(
        messages,
        mockMemory,
        "test-api-key",
        "u-test123",
      );

      expect(result.skipped).toBe(false);
      expect(result.facts.length).toBe(3);
      expect(mockMemory.saveFact).toHaveBeenCalledWith("name", "Moikapy");
      expect(mockMemory.saveFact).toHaveBeenCalledWith("preferred_language", "TypeScript");
      expect(mockMemory.saveFact).toHaveBeenCalledWith("project", "origen-chat");
    });

    it("rejects credential-like facts from LLM output", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: "name=Bob\napi_key=sk-abc123",
                },
              },
            ],
          }),
      });

      const result = await consolidateConversation(
        [{ role: "user", content: "I'm Bob" }],
        mockMemory,
        "test-api-key",
        "u-test456",
      );

      expect(result.facts.length).toBe(1); // api_key rejected
      expect(result.facts[0].key).toBe("name");
    });

    it("skips when rate limited (within cooldown)", async () => {
      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "name=Test" } }] }),
      });
      await consolidateConversation(
        [{ role: "user", content: "test" }],
        mockMemory,
        "test-api-key",
        "u-ratelimit",
      );

      // Second call within cooldown
      const result = await consolidateConversation(
        [{ role: "user", content: "test again" }],
        mockMemory,
        "test-api-key",
        "u-ratelimit",
      );

      expect(result.skipped).toBe(true);
      expect(result.facts).toHaveLength(0);
    });

    it("skips when no user messages", async () => {
      const result = await consolidateConversation(
        [{ role: "assistant", content: "Hello!" }],
        mockMemory,
        "test-api-key",
        "u-nomsg",
      );

      expect(result.facts).toHaveLength(0);
    });

    it("handles LLM errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await consolidateConversation(
        [{ role: "user", content: "test" }],
        mockMemory,
        "test-api-key",
        "u-llmerr",
      );

      expect(result.facts).toHaveLength(0); // best-effort, no crash
    });

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await consolidateConversation(
        [{ role: "user", content: "test" }],
        mockMemory,
        "test-api-key",
        "u-neterr",
      );

      expect(result.facts).toHaveLength(0);
    });

    it("handles empty LLM output", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
      });

      const result = await consolidateConversation(
        [{ role: "user", content: "hello" }],
        mockMemory,
        "test-api-key",
        "u-empty",
      );

      expect(result.facts).toHaveLength(0);
    });
  });
});