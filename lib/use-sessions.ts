"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type Session,
  type SessionMessage,
  createSession as createNewSession,
  listSessions,
  getSession,
  saveSession,
  deleteSession as deleteSessionFromDB,
  renameSession as renameSessionInDB,
  appendMessage as appendMessageToDB,
  updateLastMessage as updateLastMessageInDB,
} from "@/lib/session-store";

export { type Session, type SessionMessage } from "@/lib/session-store";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Debounce timer for streaming updates
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sessions on mount
  useEffect(() => {
    listSessions().then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  const refreshList = useCallback(async () => {
    const s = await listSessions();
    setSessions(s);
  }, []);

  // Create a new session, save it, and switch to it
  const createNew = useCallback(
    async (model: string) => {
      const session = createNewSession(model);
      await saveSession(session);
      await refreshList();
      setActiveId(session.id);
      setActiveSession(session);
      return session;
    },
    [refreshList],
  );

  // Switch to an existing session
  const switchTo = useCallback(
    async (id: string) => {
      const session = await getSession(id);
      if (session) {
        setActiveId(id);
        setActiveSession(session);
      }
    },
    [],
  );

  // Delete a session
  const remove = useCallback(
    async (id: string) => {
      await deleteSessionFromDB(id);
      if (activeId === id) {
        setActiveId(null);
        setActiveSession(null);
      }
      await refreshList();
    },
    [activeId, refreshList],
  );

  // Rename a session
  const rename = useCallback(
    async (id: string, title: string) => {
      await renameSessionInDB(id, title);
      await refreshList();
      if (activeId === id) {
        setActiveSession((prev) => (prev ? { ...prev, title } : prev));
      }
    },
    [activeId, refreshList],
  );

  // Append a message and auto-title
  const appendMessage = useCallback(
    async (message: SessionMessage) => {
      if (!activeId) return;
      const session = await appendMessageToDB(activeId, message);
      if (session) {
        setActiveSession(session);
        await refreshList();
      }
    },
    [activeId, refreshList],
  );

  // Update last message (debounced for streaming)
  const updateLastMessage = useCallback(
    (partial: Partial<SessionMessage>) => {
      if (!activeId) return;
      // Update local state immediately for responsiveness
      setActiveSession((prev) => {
        if (!prev || prev.messages.length === 0) return prev;
        const messages = [...prev.messages];
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          ...partial,
        };
        return { ...prev, messages, updatedAt: Date.now() };
      });

      // Debounce DB write
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!activeId) return;
        const session = await updateLastMessageInDB(activeId, partial);
        if (session) {
          await refreshList();
        }
      }, 500);
    },
    [activeId, refreshList],
  );

  // Finalize a message (immediate DB write, cancels debounce)
  const finalizeMessage = useCallback(
    async (partial: Partial<SessionMessage>) => {
      if (!activeId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const session = await updateLastMessageInDB(activeId, partial);
      if (session) {
        setActiveSession(session);
        await refreshList();
      }
    },
    [activeId, refreshList],
  );

  // Clear active session (start fresh without creating)
  const clearActive = useCallback(() => {
    setActiveId(null);
    setActiveSession(null);
  }, []);

  return {
    sessions,
    activeId,
    activeSession,
    loading,
    createNew,
    switchTo,
    remove,
    rename,
    appendMessage,
    updateLastMessage,
    finalizeMessage,
    clearActive,
  };
}