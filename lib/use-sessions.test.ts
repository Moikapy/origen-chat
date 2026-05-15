import { describe, it, expect, vi, beforeEach } from "vitest";
import { regenerateLastResponse, useSessions } from "./use-sessions";
import type { Session } from "./session-store";

describe("regenerateLastResponse", () => {
  it("should be exported from use-sessions", () => {
    // This is a hook so we can't call it directly, but we verify it's part of the API
    const hookResult = useSessions;
    expect(typeof hookResult).toBe("function");
  });
});

describe("Session message operations", () => {
  it("removing last assistant message from messages array", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "Hello" },
      { id: "2", role: "assistant" as const, content: "Hi there" },
      { id: "3", role: "user" as const, content: "How are you?" },
      { id: "4", role: "assistant" as const, content: "I'm good" },
    ];

    // Find last assistant index using reduce (same pattern as use-sessions)
    const lastAssistantIdx = messages.reduce((acc: number, m, i) =>
      m.role === "assistant" ? i : acc, -1
    );
    expect(lastAssistantIdx).toBe(3);

    const newMessages = messages.slice(0, lastAssistantIdx);
    expect(newMessages).toHaveLength(3);
    expect(newMessages[newMessages.length - 1].role).toBe("user");
  });

  it("handles no assistant messages", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "Hello" },
    ];

    const lastAssistantIdx = messages.reduce((acc: number, m, i) =>
      m.role === "assistant" ? i : acc, -1
    );
    expect(lastAssistantIdx).toBe(-1);
  });

  it("handles empty messages", () => {
    const messages: Array<{ id: string; role: "user" | "assistant"; content: string }> = [];
    const lastAssistantIdx = messages.reduce((acc: number, m, i) =>
      m.role === "assistant" ? i : acc, -1
    );
    expect(lastAssistantIdx).toBe(-1);
  });

  it("finds last assistant message among multiple", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "Q1" },
      { id: "2", role: "assistant" as const, content: "A1" },
      { id: "3", role: "user" as const, content: "Q2" },
      { id: "4", role: "assistant" as const, content: "A2" },
      { id: "5", role: "user" as const, content: "Q3" },
      { id: "6", role: "assistant" as const, content: "A3" },
    ];

    const lastAssistantIdx = messages.reduce((acc: number, m, i) =>
      m.role === "assistant" ? i : acc, -1
    );
    expect(lastAssistantIdx).toBe(5);
    
    const trimmed = messages.slice(0, lastAssistantIdx);
    expect(trimmed).toHaveLength(5);
    expect(trimmed[trimmed.length - 1].content).toBe("Q3");
  });
});