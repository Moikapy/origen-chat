import { describe, it, expect, vi } from "vitest";
import { mergeSessions } from "./session-sync";
import type { Session } from "./session-store";

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    title: "Test chat",
    model: "openrouter/free",
    messages: [],
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("mergeSessions", () => {
  it("returns local-only sessions when remote is empty", () => {
    const local = [
      makeSession({ id: "a", updatedAt: 1000 }),
      makeSession({ id: "b", updatedAt: 2000 }),
    ];
    const result = mergeSessions(local, []);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("b"); // sorted by updatedAt desc
  });

  it("returns remote-only sessions when local is empty", () => {
    const remote = [
      makeSession({ id: "a", updatedAt: 1000 }),
    ];
    const result = mergeSessions([], remote);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("keeps the newer version when same id exists in both", () => {
    const local = [makeSession({ id: "a", title: "Local version", updatedAt: 1000 })];
    const remote = [makeSession({ id: "a", title: "Remote version", updatedAt: 2000 })];
    const result = mergeSessions(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Remote version");
  });

  it("keeps local version when it is newer", () => {
    const local = [makeSession({ id: "a", title: "Local version", updatedAt: 2000 })];
    const remote = [makeSession({ id: "a", title: "Remote version", updatedAt: 1000 })];
    const result = mergeSessions(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Local version");
  });

  it("merges different sessions from both lists", () => {
    const local = [makeSession({ id: "a", updatedAt: 1000 })];
    const remote = [makeSession({ id: "b", updatedAt: 2000 })];
    const result = mergeSessions(local, remote);
    expect(result).toHaveLength(2);
  });

  it("sorts by updatedAt descending", () => {
    const local = [
      makeSession({ id: "a", updatedAt: 100 }),
      makeSession({ id: "b", updatedAt: 300 }),
    ];
    const remote = [
      makeSession({ id: "c", updatedAt: 200 }),
    ];
    const result = mergeSessions(local, remote);
    expect(result.map(s => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("pushSession / pullSessions / deleteRemoteSession", () => {
  it("pushSession returns false on network error", async () => {
    const { pushSession } = await import("./session-sync");
    // Mock fetch to throw
    vi.stubGlobal("fetch", () => { throw new Error("Network error"); });
    const result = await pushSession(makeSession({ id: "test" }));
    expect(result).toBe(false);
    vi.restoreAllMocks();
  });

  it("pullSessions returns empty array on network error", async () => {
    const { pullSessions } = await import("./session-sync");
    vi.stubGlobal("fetch", () => { throw new Error("Network error"); });
    const result = await pullSessions();
    expect(result).toEqual([]);
    vi.restoreAllMocks();
  });

  it("deleteRemoteSession returns false on network error", async () => {
    const { deleteRemoteSession } = await import("./session-sync");
    vi.stubGlobal("fetch", () => { throw new Error("Network error"); });
    const result = await deleteRemoteSession("test");
    expect(result).toBe(false);
    vi.restoreAllMocks();
  });
});