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
    async (message: SessionMessage, overrideId?: string) => {
      const id = overrideId || activeId;
      if (!id) return;
      const session = await appendMessageToDB(id, message);
      if (session) {
        setActiveSession(session);
        await refreshList();
      }
    },
    [activeId, refreshList],
  );

  // Update last message (debounced for streaming)
  // Only updates local state immediately. DB write is debounced and
  // does NOT trigger a full refresh — that would overwrite in-flight
  // streaming state with stale DB data.
  //
  // IMPORTANT: The debounced write accumulates the latest local state
  // at write time, not the partial from the event that scheduled it.
  // This prevents partial data from overwriting accumulated content.
  const updateLastMessage = useCallback(
    (partial: Partial<SessionMessage>, overrideId?: string) => {
      const id = overrideId || activeId;
      if (!id) return;
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

      // Debounce DB write — but write the LATEST local state, not the partial
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!id) return;
        // Read current local state to get the accumulated content
        setActiveSession((prev) => {
          if (!prev || prev.messages.length === 0) return prev;
          const lastMsg = prev.messages[prev.messages.length - 1];
          // Fire-and-forget DB write with the FULL accumulated state
          updateLastMessageInDB(id, lastMsg).catch(() => {
            // Silently ignore — will be retried on finalize
          });
          return prev; // Don't change state, just borrow it
        });
      }, 500);
    },
    [activeId],
  );

  // Finalize a message (immediate DB write, cancels debounce)
  const finalizeMessage = useCallback(
    async (partial: Partial<SessionMessage>, overrideId?: string) => {
      const id = overrideId || activeId;
      if (!id) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const session = await updateLastMessageInDB(id, partial);
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

  // Truncate messages after a given index and update the last user message
  // Used for edit-and-resend: keeps messages up to editIndex, replaces message at editIndex
  const editAndResend = useCallback(
    async (editIndex: number, newContent: string) => {
      const id = activeId;
      if (!id || !activeSession) return null;
      const truncatedMessages = activeSession.messages.slice(0, editIndex);
      // Replace the message at editIndex with new content
      const editedMessage: SessionMessage = {
        ...activeSession.messages[editIndex],
        content: newContent,
      };
      const newMessages = [...truncatedMessages, editedMessage];
      const updated: Session = {
        ...activeSession,
        messages: newMessages,
        updatedAt: Date.now(),
      };
      await saveSession(updated);
      setActiveSession(updated);
      await refreshList();
      return updated;
    },
    [activeId, activeSession, refreshList],
  );

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
    editAndResend,
  };
}