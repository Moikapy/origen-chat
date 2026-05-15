"use client";

import type { Session } from "./session-store";

const API = "/api/sessions";

/** Push a session to D1 (upsert). Only call when authenticated. */
export async function pushSession(session: Session): Promise<boolean> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: session.id,
        title: session.title,
        model: session.model,
        systemPrompt: session.systemPrompt,
        messages: session.messages,
        updatedAt: session.updatedAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pull all sessions from D1. Only call when authenticated. */
export async function pullSessions(): Promise<Session[]> {
  try {
    const res = await fetch(API);
    if (!res.ok) return [];
    const data = await res.json() as { sessions: ServerSession[] };
    return data.sessions.map(fromServer);
  } catch {
    return [];
  }
}

/** Delete a session from D1. Only call when authenticated. */
export async function deleteRemoteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Merge remote sessions into local, keeping the newer version of each. */
export function mergeSessions(local: Session[], remote: Session[]): Session[] {
  const map = new Map<string, Session>();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) {
    const existing = map.get(s.id);
    if (!existing || s.updatedAt > existing.updatedAt) {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Server session shape (from D1) */
interface ServerSession {
  id: string;
  title: string;
  model: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  // messages not returned in list endpoint (too heavy)
}

/** Convert server session to client Session */
function fromServer(s: ServerSession): Session {
  return {
    id: s.id,
    title: s.title,
    model: s.model,
    systemPrompt: s.system_prompt || undefined,
    messages: [], // messages are loaded on demand per session
    createdAt: s.created_at * 1000,
    updatedAt: s.updated_at * 1000,
  };
}