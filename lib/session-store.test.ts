import { describe, it, expect, beforeEach } from "vitest";
import {
  type Session,
  type SessionMessage,
  createSession,
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  renameSession,
  appendMessage,
  updateLastMessage,
} from "./session-store";

// Mock IndexedDB for testing
import "fake-indexeddb/auto";

describe("session-store", () => {
  beforeEach(async () => {
    // Clean up all sessions before each test
    const sessions = await listSessions();
    for (const s of sessions) {
      await deleteSession(s.id);
    }
  });

  describe("createSession", () => {
    it("creates a session with default values", () => {
      const session = createSession("openrouter/free");
      expect(session.id).toBeDefined();
      expect(session.model).toBe("openrouter/free");
      expect(session.title).toBe("New chat");
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.updatedAt).toBeGreaterThan(0);
      expect(session.systemPrompt).toBeUndefined();
    });

    it("creates a session with custom systemPrompt", () => {
      const session = createSession("openrouter/free");
      session.systemPrompt = "You are a helpful assistant";
      expect(session.systemPrompt).toBe("You are a helpful assistant");
    });
  });

  describe("saveSession & getSession", () => {
    it("saves and retrieves a session", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      const retrieved = await getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
      expect(retrieved!.model).toBe("openrouter/free");
    });

    it("saves and retrieves systemPrompt", async () => {
      const session = createSession("openrouter/free");
      session.systemPrompt = "Be concise";
      await saveSession(session);
      const retrieved = await getSession(session.id);
      expect(retrieved!.systemPrompt).toBe("Be concise");
    });

    it("returns null for non-existent session", async () => {
      const retrieved = await getSession("nonexistent-id");
      expect(retrieved).toBeFalsy();
    });
  });

  describe("listSessions", () => {
    it("returns empty list when no sessions", async () => {
      const sessions = await listSessions();
      expect(sessions).toEqual([]);
    });

    it("returns all sessions sorted by updatedAt desc", async () => {
      const s1 = createSession("openrouter/free");
      const s2 = createSession("openrouter/deepseek/deepseek-v4-flash:free");
      await saveSession(s1);
      await saveSession(s2);
      const sessions = await listSessions();
      expect(sessions.length).toBe(2);
      // Most recent first
      expect(sessions[0].updatedAt).toBeGreaterThanOrEqual(sessions[1].updatedAt);
    });
  });

  describe("deleteSession", () => {
    it("deletes a session", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      await deleteSession(session.id);
      const retrieved = await getSession(session.id);
      expect(retrieved).toBeFalsy();
    });

    it("does not throw when deleting non-existent session", async () => {
      await expect(deleteSession("nonexistent-id")).resolves.toBeUndefined();
    });
  });

  describe("renameSession", () => {
    it("renames a session", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      await renameSession(session.id, "My custom title");
      const retrieved = await getSession(session.id);
      expect(retrieved!.title).toBe("My custom title");
    });
  });

  describe("appendMessage", () => {
    it("appends a message to a session", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      const msg: SessionMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Hello, world!",
      };
      const updated = await appendMessage(session.id, msg);
      expect(updated).not.toBeNull();
      expect(updated!.messages.length).toBe(1);
      expect(updated!.messages[0].content).toBe("Hello, world!");
    });
  });

  describe("updateLastMessage", () => {
    it("updates the last message in a session", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      const msg: SessionMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        streaming: true,
      };
      await appendMessage(session.id, msg);
      await updateLastMessage(session.id, { content: "Hello!", streaming: false });
      const retrieved = await getSession(session.id);
      expect(retrieved!.messages[0].content).toBe("Hello!");
      expect(retrieved!.messages[0].streaming).toBe(false);
    });
  });

  describe("systemPrompt isolation", () => {
    it("different sessions can have different system prompts", async () => {
      const s1 = createSession("openrouter/free");
      s1.systemPrompt = "You are a pirate";
      const s2 = createSession("openrouter/free");
      s2.systemPrompt = "You are a poet";
      await saveSession(s1);
      await saveSession(s2);
      const r1 = await getSession(s1.id);
      const r2 = await getSession(s2.id);
      expect(r1!.systemPrompt).toBe("You are a pirate");
      expect(r2!.systemPrompt).toBe("You are a poet");
    });

    it("systemPrompt is optional and defaults to undefined", async () => {
      const session = createSession("openrouter/free");
      await saveSession(session);
      const retrieved = await getSession(session.id);
      expect(retrieved!.systemPrompt).toBeUndefined();
    });

    it("can update systemPrompt without affecting other fields", async () => {
      const session = createSession("openrouter/free");
      session.systemPrompt = "Old prompt";
      await saveSession(session);
      const retrieved = await getSession(session.id);
      retrieved!.systemPrompt = "New prompt";
      await saveSession(retrieved!);
      const updated = await getSession(session.id);
      expect(updated!.systemPrompt).toBe("New prompt");
      expect(updated!.model).toBe("openrouter/free");
      expect(updated!.title).toBe("New chat");
    });
  });
});