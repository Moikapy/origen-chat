"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ChatMessage } from "@/components/chat-message";
import { ModelSelector } from "@/components/model-selector";
import { useAuth } from "@/lib/auth";

// Client-safe StreamEvent type
type StreamEvent =
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "text"; content: string }
  | { type: "done"; message: string; citations: Array<{ book: string; chapter: number; verse: number }>; usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number } }
  | { type: "error"; message: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: string }>;
  citations?: Array<{ book: string; chapter: number; verse: number }>;
  usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number };
  streaming?: boolean;
}

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<string>("openrouter/free");
  const abortRef = useRef<AbortController | null>(null);

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

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!editor || streaming) return;
    const text = editor.getText();
    if (!text.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    editor.commands.clearContent();

    setStreaming(true);
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const auth = getAuthConfig();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
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
          // fallback to raw text
          errMsg = await res.text();
        }
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = { ...u[u.length - 1], content: errMsg, streaming: false };
          return u;
        });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      let currentReasoning = "";
      let currentToolCalls: Message["toolCalls"] = [];
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
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], reasoning: currentReasoning };
                  return u;
                });
                break;
              case "text":
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], content: u[u.length - 1].content + event.content };
                  return u;
                });
                break;
              case "tool_call":
                currentToolName = event.name;
                currentToolArgs = event.args;
                break;
              case "tool_result":
                currentToolCalls = [...(currentToolCalls ?? []), { name: currentToolName, args: currentToolArgs, result: event.result }];
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], toolCalls: currentToolCalls };
                  return u;
                });
                break;
              case "done":
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], citations: event.citations, usage: event.usage, streaming: false };
                  return u;
                });
                break;
              case "error":
                setMessages((prev) => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], content: `Error: ${event.message}`, streaming: false };
                  return u;
                });
                break;
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        setMessages((prev) => {
          const u = [...prev];
          u[u.length - 1] = { ...u[u.length - 1], content: `Error: ${err instanceof Error ? err.message : "Unknown"}`, streaming: false };
          return u;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [editor, streaming, messages, model]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            <Link href="/chat" className="hover:opacity-80 transition-opacity">Origen Chat</Link>
          </h1>
          <div className="flex items-center gap-3">
            <ModelSelector value={model} onChange={setModel} />
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">{user.email}</span>
                <button
                  onClick={logout}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="text-sm text-primary hover:underline">
                Sign in
              </Link>
            )}
            <button
              onClick={clearChat}
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
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <p className="text-2xl font-semibold text-foreground mb-2">Origen Chat</p>
              <p>Ask anything. {user ? `Signed in as ${user.email}` : <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link>} for your provider settings.</p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {streaming && messages[messages.length - 1]?.content === "" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-pulse h-2 w-2 rounded-full bg-primary" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}
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
  } catch { return {}; }
}