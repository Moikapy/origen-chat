import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessions } from "./use-sessions";
import {
  createSession,
  listSessions,
  saveSession,
  deleteSession,
  renameSession,
  appendMessage,
  updateLastMessage,
} from "./session-store";
import type { Session, SessionMessage } from "./session-store";

// Clear IndexedDB between tests
beforeEach(async () => {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
});

describe("useSessions", () => {
  it("starts with empty sessions and loading=true", async () => {
    const { result } = renderHook(() => useSessions());

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for loading to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeId).toBeNull();
    expect(result.current.activeSession).toBeNull();
  });

  it("createNew creates a session and sets it as active", async () => {
    const { result } = renderHook(() => useSessions());

    // Wait for initial load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Create a new session
    await act(async () => {
      const session = await result.current.createNew("openrouter/free");
      expect(session).toBeDefined();
      expect(session!.model).toBe("openrouter/free");
      expect(session!.messages).toEqual([]);
    });

    // Active session should be set
    expect(result.current.activeId).toBeTruthy();
    expect(result.current.activeSession).toBeDefined();
    expect(result.current.sessions).toHaveLength(1);
  });

  it("switchTo changes active session", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Create two sessions
    let firstId = "";
    let secondId = "";
    await act(async () => {
      const s1 = await result.current.createNew("openrouter/free");
      firstId = s1!.id;
    });
    await act(async () => {
      const s2 = await result.current.createNew("openrouter/free");
      secondId = s2!.id;
    });

    // Active should be second (last created)
    expect(result.current.activeId).toBe(secondId);

    // Switch to first
    await act(async () => {
      await result.current.switchTo(firstId);
    });

    // After switchTo, activeId should match first session
    // Note: switchTo is async and reads from IndexedDB
    expect(result.current.activeId).toBe(firstId);
  });

  it("remove deletes a session", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    let sessionId: string;
    await act(async () => {
      const s = await result.current.createNew("openrouter/free");
      sessionId = s!.id;
    });

    expect(result.current.sessions).toHaveLength(1);

    // Delete it
    await act(async () => {
      await result.current.remove(sessionId);
    });

    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it("rename updates a session title", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    let sessionId: string;
    await act(async () => {
      const s = await result.current.createNew("openrouter/free");
      sessionId = s!.id;
    });

    const originalTitle = result.current.sessions[0].title;

    await act(async () => {
      await result.current.rename(sessionId, "My custom title");
    });

    expect(result.current.sessions[0].title).toBe("My custom title");
  });

  it("appendMessage adds a message to active session", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.createNew("openrouter/free");
    });

    const msg: SessionMessage = {
      id: "msg-1",
      role: "user",
      content: "Hello world",
    };

    await act(async () => {
      await result.current.appendMessage(msg, result.current.activeId!);
    });

    expect(result.current.activeSession?.messages).toHaveLength(1);
    expect(result.current.activeSession?.messages[0].content).toBe("Hello world");
  });

  it("updateLastMessage updates the last message", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.createNew("openrouter/free");
    });

    const msg: SessionMessage = {
      id: "msg-1",
      role: "assistant",
      content: "",
    };

    await act(async () => {
      await result.current.appendMessage(msg, result.current.activeId!);
    });

    // Update last message
    await act(async () => {
      await result.current.updateLastMessage({ content: "Hello!" }, result.current.activeId!);
    });

    expect(result.current.activeSession?.messages[0].content).toBe("Hello!");
  });

  it("finalizeMessage marks message as complete", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.createNew("openrouter/free");
    });

    const msg: SessionMessage = {
      id: "msg-1",
      role: "assistant",
      content: "",
      streaming: true,
    };

    await act(async () => {
      await result.current.appendMessage(msg, result.current.activeId!);
    });

    // Finalize
    await act(async () => {
      await result.current.finalizeMessage({
        content: "Final answer",
        streaming: false,
      }, result.current.activeId!);
    });

    const lastMsg = result.current.activeSession?.messages[0];
    expect(lastMsg?.content).toBe("Final answer");
    expect(lastMsg?.streaming).toBe(false);
  });

  it("updateSystemPrompt changes session system prompt", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    let sid: string;
    await act(async () => {
      const s = await result.current.createNew("openrouter/free");
      sid = s!.id;
    });

    expect(result.current.activeSession?.systemPrompt).toBeUndefined();

    await act(async () => {
      await result.current.updateSystemPrompt(sid, "You are a helpful assistant");
    });

    expect(result.current.activeSession?.systemPrompt).toBe("You are a helpful assistant");
  });

  it("clearActive resets active session", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.createNew("openrouter/free");
    });

    expect(result.current.activeId).toBeTruthy();

    await act(async () => {
      result.current.clearActive();
    });

    expect(result.current.activeId).toBeNull();
    expect(result.current.activeSession).toBeNull();
  });

  it("editAndResend truncates messages and replaces content", async () => {
    const { result } = renderHook(() => useSessions());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    await act(async () => {
      await result.current.createNew("openrouter/free");
    });

    // Add user message, assistant message, then another user message
    const msgs: SessionMessage[] = [
      { id: "m1", role: "user", content: "First question" },
      { id: "m2", role: "assistant", content: "First answer" },
      { id: "m3", role: "user", content: "Second question" },
    ];

    for (const m of msgs) {
      await act(async () => {
        await result.current.appendMessage(m, result.current.activeId!);
      });
    }

    expect(result.current.activeSession?.messages).toHaveLength(3);

    // Edit message at index 0 (the first user message)
    await act(async () => {
      const updated = await result.current.editAndResend(0, "Edited question");
      expect(updated).toBeDefined();
    });

    // Should have: edited message at index 0, nothing after
    // editAndResend truncates after editIndex, then adds the edited message
    const messages = result.current.activeSession?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Edited question");
  });
});