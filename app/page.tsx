"use client";

import { useState, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Badge } from "@0xkobold/warm-editorial";
import type { StreamEvent } from "@moikapy/origen";
import { ChatMessage } from "@/components/chat-message";
import { ModelSelector } from "@/components/model-selector";
import { WikiToggle } from "@/components/wiki-toggle";
import { ProviderSettings } from "@/components/provider-settings";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: string }>;
  citations?: Array<{ book: string; chapter: number; verse: number }>;
  usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState("openrouter/free");
  const [wikiEnabled, setWikiEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Ask anything..." }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "tiptap" },
    },
  });

  const sendMessage = useCallback(async () => {
    if (!editor || streaming) return;
    const markdown = editor.storage.markdown?.getMarkdown() ?? editor.getText();
    if (!markdown.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: markdown.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    editor.commands.clearContent();

    // Start streaming
    setStreaming(true);
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          model,
          wiki: wikiEnabled,
          ...getAuthFromStorage(),
        }),
        signal: abort.signal,
      });

      if (!res.ok) throw new Error(await res.text());

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
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    reasoning: currentReasoning,
                  };
                  return updated;
                });
                break;
              case "text":
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.content,
                  };
                  return updated;
                });
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
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    toolCalls: currentToolCalls,
                  };
                  return updated;
                });
                break;
              case "done":
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    citations: event.citations,
                    usage: event.usage,
                  };
                  return updated;
                });
                break;
              case "error":
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: `Error: ${event.message}`,
                  };
                  return updated;
                });
                break;
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — keep partial response
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [editor, streaming, messages, model, wikiEnabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[var(--chat-max-width)] px-[var(--chat-padding)] py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold">Origen Chat</h1>
          <div className="flex items-center gap-2">
            <ModelSelector value={model} onChange={setModel} />
            <WikiToggle enabled={wikiEnabled} onToggle={setWikiEnabled} />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Settings */}
        {showSettings && (
          <ProviderSettings onClose={() => setShowSettings(false)} />
        )}

        {/* Messages */}
        <div className="space-y-4 mb-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {streaming && !messages[messages.length - 1]?.content && (
            <div className="text-muted-foreground text-sm animate-pulse">Thinking...</div>
          )}
        </div>

        {/* Input */}
        <div
          className="border border-border rounded-lg bg-card p-3 focus-within:ring-2 focus-within:ring-ring"
          onKeyDown={handleKeyDown}
        >
          <EditorContent editor={editor} />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground">
              {wikiEnabled && <Badge variant="default">Wiki ON</Badge>}
            </span>
            <div className="flex gap-2">
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="text-sm px-3 py-1 rounded bg-destructive text-destructive-foreground hover:opacity-90"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  className="text-sm px-3 py-1 rounded bg-foreground text-background hover:opacity-90"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getAuthFromStorage() {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("origen_chat_auth");
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}