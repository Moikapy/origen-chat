"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ChatMessage } from "@/components/chat-message";
import { SessionSidebar } from "@/components/session-sidebar";
import { useSessions } from "@/lib/use-sessions";
import type { SessionMessage } from "@/lib/session-store";
import { useAuth } from "@/lib/auth";

// Client-safe StreamEvent type
type StreamEvent =
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "text"; content: string }
  | { type: "done"; message: string; citations: Array<{ book: string; chapter: number; verse: number }>; usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number } }
  | { type: "error"; message: string };

export default function ChatPage() {
  const { user, logout } = useAuth();
  const {
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
  } = useSessions();

  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<string>("openrouter/free");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync model from active session when switching
  useEffect(() => {
    if (activeSession?.model) {
      setModel(activeSession.model);
    }
  }, [activeSession?.model]);

  // Force free models for logged-out users
  useEffect(() => {
    if (!user && model !== "openrouter/free" && !model.endsWith(":free")) {
      setModel("openrouter/free");
    }
  }, [user]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: "Ask anything..." }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm prose-invert max-w-none focus:outline-none min-h-[2rem]",
      },
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  // Abort streaming on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleNewChat = useCallback(async () => {
    if (streaming) return;
    const session = await createNew(model);
    // sidebar stays as-is, just switches to new session
  }, [createNew, model, streaming]);

  const sendMessage = useCallback(async () => {
    if (!editor || streaming) return;
    const text = editor.getText();
    if (!text.trim()) return;

    // Ensure we have an active session — use local ID if React state hasn't caught up
    let sessionId = activeId;
    let currentMessages = activeSession?.messages ?? [];
    if (!sessionId) {
      const session = await createNew(model);
      sessionId = session.id;
      currentMessages = session.messages; // fresh session, empty messages
    }

    const userMsg: SessionMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    await appendMessage(userMsg, sessionId);
    editor.commands.clearContent();

    setStreaming(true);
    const assistantMsg: SessionMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    await appendMessage(assistantMsg, sessionId);

    const abort = new AbortController();
    abortRef.current = abort;
    // Timeout after 60s if upstream hangs
    const timeout = setTimeout(() => abort.abort(), 60_000);

    try {
      const auth = getAuthConfig();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...currentMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model,
          wiki: true,
          ...auth,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try {
          const errBody = (await res.json()) as { error?: string };
          errMsg = errBody.error || errMsg;
        } catch {
          errMsg = await res.text();
        }
        await finalizeMessage({ content: errMsg, streaming: false }, sessionId);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      let currentReasoning = "";
      let currentContent = "";
      let currentToolCalls: SessionMessage["toolCalls"] = [];
      let currentToolName = "";
      let currentToolArgs: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event: StreamEvent = JSON.parse(data);
            switch (event.type) {
              case "reasoning":
                currentReasoning += event.content;
                updateLastMessage({ reasoning: currentReasoning }, sessionId);
                break;
              case "text":
                currentContent += event.content;
                updateLastMessage({
                  content: currentContent,
                }, sessionId);
                break;
              case "tool_call":
                currentToolName = event.name;
                currentToolArgs = event.args;
                break;
              case "tool_result":
                currentToolCalls = [
                  ...(currentToolCalls ?? []),
                  { name: currentToolName, args: currentToolArgs, result: event.result },
                ];
                updateLastMessage({ toolCalls: currentToolCalls }, sessionId);
                break;
              case "done":
                await finalizeMessage({
                  content: currentContent || undefined,
                  reasoning: currentReasoning || undefined,
                  toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
                  citations: event.citations,
                  usage: event.usage,
                  streaming: false,
                }, sessionId);
                break;
              case "error":
                // Preserve any content that was already streamed before the error
                const errorContent = currentContent
                  ? `${currentContent}\n\n⚠️ Error: ${event.message}`
                  : `Error: ${event.message}`;
                await finalizeMessage({
                  content: errorContent,
                  streaming: false,
                }, sessionId);
                break;
            }
          } catch {
            /* skip malformed SSE */
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        await finalizeMessage({
          content: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
          streaming: false,
        }, sessionId);
      }
    } finally {
      clearTimeout(timeout);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [editor, streaming, model, activeId, activeSession, appendMessage, updateLastMessage, finalizeMessage, createNew]);

  const handleEditAndResend = useCallback(async (editIndex: number, newContent: string) => {
    if (streaming || !activeId) return;

    // Truncate messages and update the edited user message
    const updated = await editAndResend(editIndex, newContent);
    if (!updated) return;

    // Now resend from that point
    setStreaming(true);
    const assistantMsg: SessionMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    await appendMessage(assistantMsg, activeId);

    const abort = new AbortController();
    abortRef.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60_000);

    try {
      const auth = getAuthConfig();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.messages.map((m: SessionMessage) => ({
            role: m.role,
            content: m.content,
          })),
          model,
          wiki: true,
          ...auth,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try { const err = await res.json() as { error?: string }; errMsg = err.error || errMsg; } catch { /* */ }
        await finalizeMessage({ content: errMsg, streaming: false }, activeId);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      let currentReasoning = "";
      let currentContent = "";
      let currentToolCalls: SessionMessage["toolCalls"] = [];
      let currentToolName = "";
      let currentToolArgs: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const event: StreamEvent = JSON.parse(data);
            switch (event.type) {
              case "reasoning":
                currentReasoning += event.content;
                updateLastMessage({ reasoning: currentReasoning }, activeId);
                break;
              case "text":
                currentContent += event.content;
                updateLastMessage({ content: currentContent }, activeId);
                break;
              case "tool_call":
                currentToolName = event.name;
                currentToolArgs = event.args;
                break;
              case "tool_result":
                currentToolCalls = [
                  ...(currentToolCalls ?? []),
                  { name: currentToolName, args: currentToolArgs, result: event.result },
                ];
                updateLastMessage({ toolCalls: currentToolCalls }, activeId);
                break;
              case "done":
                await finalizeMessage({
                  content: currentContent || undefined,
                  reasoning: currentReasoning || undefined,
                  toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
                  citations: event.citations,
                  usage: event.usage,
                  streaming: false,
                }, activeId);
                break;
              case "error":
                const errorContent = currentContent
                  ? `${currentContent}\n\n⚠️ Error: ${event.message}`
                  : `Error: ${event.message}`;
                await finalizeMessage({ content: errorContent, streaming: false }, activeId);
                break;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        await finalizeMessage({
          content: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
          streaming: false,
        }, activeId);
      }
    } finally {
      clearTimeout(timeout);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming, activeId, model, editAndResend, appendMessage, updateLastMessage, finalizeMessage]);

  const messages = activeSession?.messages ?? [];

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden">
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        activeModel={model}
        onSelect={switchTo}
        onDelete={remove}
        onRename={rename}
        onNew={handleNewChat}
        onModelChange={setModel}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-border px-4 py-3">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Sidebar toggle — mobile: overlay, desktop: collapse/expand */}
              <button
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setSidebarOpen(true);
                  } else {
                    setSidebarCollapsed(!sidebarCollapsed);
                  }
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold tracking-tight">
                <Link href="/chat" className="hover:opacity-80 transition-opacity">Origen Chat</Link>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="New chat"
              >
                New
              </button>
              <Link
                href="/settings"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6 pb-4">
            {messages.length === 0 && !activeId && (
              <div className="text-center text-muted-foreground py-16">
                <p className="text-2xl font-semibold text-foreground mb-2">Origen Chat</p>
                <p>
                  Ask anything.{" "}
                  {user ? (
                    `Signed in as ${user.email}`
                  ) : (
                    <Link href="/auth/login" className="text-primary hover:underline">
                      Sign in
                    </Link>
                  )}{" "}
                  for your provider settings.
                </p>
              </div>
            )}
            {messages.length === 0 && activeId && (
              <div className="text-center text-muted-foreground py-16">
                <p className="text-lg">Start a conversation or pick a model above.</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <ChatMessage key={msg.id} message={msg} index={idx} onEdit={handleEditAndResend} />
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-pulse h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
        <footer className="border-t border-border px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div
              className="flex gap-3 items-end border border-border rounded-lg bg-card p-3 focus-within:ring-2 focus-within:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            >
              <div className="flex-1 min-h-[2rem]">
                <EditorContent editor={editor} />
              </div>
              <div className="flex-shrink-0">
                {streaming ? (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="text-sm px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-colors"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!editor?.getText().trim()}
                    className="text-sm px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 transition-colors disabled:opacity-30"
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Get auth config from localStorage (Ollama) — OpenRouter auth is via encrypted cookie */
function getAuthConfig(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("origen_ollama_config");
  if (!stored) return {};
  try {
    const config = JSON.parse(stored);
    if (config.baseUrl) return { ollamaBaseUrl: config.baseUrl, ollamaApiKey: config.apiKey || "" };
    return {};
  } catch {
    return {};
  }
}