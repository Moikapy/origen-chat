"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ChatMessage } from "@/components/chat-message";
import { SessionSidebar } from "@/components/session-sidebar";
import { useSessions } from "@/lib/use-sessions";
import { useChat, getAuthConfig, type ChatMessageInput } from "@/lib/use-chat";
import type { SessionMessage } from "@/lib/session-store";
import { useAuth } from "@/lib/auth";
import { ModelSelector } from "@/components/model-selector";

function ChatPageInner() {
  const { user, openrouterConnected } = useAuth();
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
    editAndResend,
    updateSystemPrompt,
    syncOnAuth,
    regenerateLastResponse,
  } = useSessions();

  const [model, setModel] = useState<string>("openrouter/free");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const messages = activeSession?.messages ?? [];

  // Chat hook — handles streaming, SSE parsing, abort
  const { streaming, streamElapsed, sendMessage: chatSendMessage, stop } = useChat({
    model,
    systemPrompt: activeSession?.systemPrompt,
    appendMessage: async (msg, sid) => { appendMessage(msg, sid); },
    updateLastMessage: async (updates, sid) => { updateLastMessage(updates, sid); },
    finalizeMessage: async (updates, sid) => { finalizeMessage(updates, sid); },
  });

  // Read model from URL search params (deep link from models page)
  const searchParams = useSearchParams();
  useEffect(() => {
    const m = searchParams.get("model");
    if (m) setModel(m);
  }, [searchParams]);

  // Sync sessions from D1 when authenticated
  useEffect(() => {
    if (user?.id) syncOnAuth(user.id);
  }, [user?.id]);

  // Sync model from active session when switching
  useEffect(() => {
    if (activeSession?.model) setModel(activeSession.model);
  }, [activeSession?.model]);

  // Force free models for logged-out users
  useEffect(() => {
    if (!user && model !== "openrouter/free" && !model.endsWith(":free")) {
      setModel("openrouter/free");
    }
  }, [user]);

  // Editor
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

  // Smart auto-scroll: only scroll if user is near bottom (<150px)
  const [showScrollFab, setShowScrollFab] = useState(false);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    setShowScrollFab(!nearBottom && (activeSession?.messages?.length ?? 0) > 0);
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
    }
  }, [activeSession?.messages, streaming]);

  const handleNewChat = useCallback(async () => {
    if (streaming) return;
    await createNew(model);
  }, [createNew, model, streaming]);


  // Keyboard shortcuts
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n") {
        e.preventDefault();
        handleNewChat();
      }
      if (e.key === "Escape") {
        if (sidebarOpen) setSidebarOpen(false);
        else setSidebarCollapsed(!sidebarCollapsed);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcuts(true);
        setTimeout(() => setShowShortcuts(false), 2000);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewChat, sidebarOpen, sidebarCollapsed]);

  // Send a new message
  const handleSend = useCallback(async () => {
    if (!editor || streaming) return;
    const text = editor.getText();
    if (!text.trim()) return;

    let sessionId = activeId;
    let currentMessages = activeSession?.messages ?? [];
    if (!sessionId) {
      const session = await createNew(model);
      sessionId = session.id;
      currentMessages = session.messages;
    }

    const userMsg: SessionMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    await appendMessage(userMsg, sessionId);
    editor.commands.clearContent();

    const chatMessages: ChatMessageInput[] = [...currentMessages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));
    await chatSendMessage(chatMessages, sessionId);

    // Auto-title: rename "New chat" sessions after first assistant response
    const title = text.trim().substring(0, 50);
    if (title && activeSession?.title === "New chat") {
      rename(sessionId, title);
    }
  }, [editor, streaming, activeId, activeSession, model, createNew, appendMessage, chatSendMessage]);

  // Edit a message and resend
  const handleEditAndResend = useCallback(async (editIndex: number, newContent: string) => {
    if (streaming || !activeId) return;
    const updated = await editAndResend(editIndex, newContent);
    if (!updated) return;

    const chatMessages: ChatMessageInput[] = updated.messages.map((m: SessionMessage) => ({
      role: m.role,
      content: m.content,
    }));
    await chatSendMessage(chatMessages, activeId);
  }, [streaming, activeId, editAndResend, chatSendMessage]);

  // Regenerate last response
  const handleRegenerate = useCallback(async () => {
    if (streaming || !activeId) return;
    const updated = await regenerateLastResponse();
    if (!updated) return;

    const chatMessages: ChatMessageInput[] = updated.messages.map((m: SessionMessage) => ({
      role: m.role,
      content: m.content,
    }));
    await chatSendMessage(chatMessages, activeId);
  }, [streaming, activeId, regenerateLastResponse, chatSendMessage]);

  // Export chat as markdown
  const handleExport = useCallback(() => {
    if (!activeSession) return;
    const title = activeSession.title || "Chat";
    const lines = [`# ${title}`, ""];
    for (const msg of messages) {
      if (msg.role === "user") {
        lines.push(`**User:** ${msg.content}`);
      } else if (msg.role === "assistant") {
        if (msg.reasoning) lines.push(`*Reasoning:* ${msg.reasoning}`, "");
        lines.push(`**Assistant:** ${msg.content}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSession, messages]);


  return (
    <div className="h-dvh bg-background text-foreground flex overflow-hidden">
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeId={activeId}
        activeModel={model}
        systemPrompt={activeSession?.systemPrompt}
        loading={loading}
        onSelect={switchTo}
        onDelete={remove}
        onRename={rename}
        onNew={handleNewChat}
        onSystemPromptChange={(prompt) => {
          if (activeId) updateSystemPrompt(activeId, prompt);
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-border px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="mx-auto max-w-3xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(true);
                  else setSidebarCollapsed(!sidebarCollapsed);
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
              <button onClick={handleNewChat} className="text-sm text-muted-foreground hover:text-foreground transition-colors">New</button>
              {messages.length > 0 && (
                <button onClick={handleExport} className="text-sm text-muted-foreground hover:text-foreground transition-colors" title="Export chat as markdown">Export</button>
              )}
              <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
            </div>
          </div>
        </header>

        {/* Messages */}
        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="mx-auto max-w-3xl space-y-6 pb-4">
            {messages.length === 0 && !activeId && (
              <div className="text-center text-muted-foreground py-16">
                <p className="text-2xl font-semibold text-foreground mb-2">Origen Chat</p>
                <p>
                  Ask anything.{" "}
                  {user ? (
                    `Signed in as ${user.email}`
                  ) : (
                    <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>
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
              <ChatMessage
                key={msg.id}
                message={msg}
                index={idx}
                onEdit={handleEditAndResend}
                onRegenerate={msg.role === "assistant" && idx === messages.length - 1 ? handleRegenerate : undefined}
                streaming={streaming && idx === messages.length - 1 && msg.role === "assistant"}
              />
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-pulse h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            {showScrollFab && (
              <button
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="fixed bottom-24 right-8 z-10 bg-card border border-border rounded-full p-2 shadow-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Scroll to bottom"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </button>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Streaming status bar */}
        {streaming && (
          <div className="px-4 py-1 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-2">
            <span className="animate-pulse text-primary">●</span>
            <span>Streaming... {streamElapsed}s</span>
          </div>
        )}

        {/* Input */}
        <footer className="border-t border-border px-3 sm:px-4 pb-4 sm:pb-5 pt-2 sm:pt-3">
          <div className="mx-auto max-w-3xl">
            <div
              className="border border-border rounded-xl bg-card p-3 pt-2 focus-within:ring-2 focus-within:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            >
              {/* Text input area */}
              <div className="min-h-[2rem]">
                <EditorContent editor={editor} />
              </div>
              {/* Bottom row: model selector + send */}
              <div className="flex items-center gap-2 mt-2">
                <ModelSelector
                  value={model}
                  onChange={setModel}
                  freeOnly={!user && !openrouterConnected}
                  byok={openrouterConnected}
                />
                <div className="flex-1" />
                <div className="flex-shrink-0">
                  {streaming ? (
                    <button
                      onClick={stop}
                      className="text-sm px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-colors flex items-center gap-2"
                    >
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!editor?.getText().trim()}
                      className="text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-colors disabled:opacity-30"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-card border border-border rounded-lg p-4 shadow-xl text-sm">
            <div className="text-foreground font-semibold mb-2">Keyboard Shortcuts</div>
            <div className="space-y-1 text-muted-foreground">
              <div><kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">Ctrl+Shift+N</kbd> New chat</div>
              <div><kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">Esc</kbd> Toggle sidebar</div>
              <div><kbd className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border">Ctrl+/</kbd> Show shortcuts</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";

export default function ChatPage() {
  return (
    <ErrorBoundary>
      <Suspense>
        <ChatPageInner />
      </Suspense>
    </ErrorBoundary>
  );
}
