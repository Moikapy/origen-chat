import { useState, useRef, useCallback, useEffect } from "react";
import type { SessionMessage } from "@/lib/session-store";

// Client-safe StreamEvent type
export type StreamEvent =
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "text"; content: string }
  | { type: "done"; message: string; citations: Array<{ book: string; chapter: number; verse: number }>; usage?: { promptTokens?: number; completionTokens?: number; totalCost?: number } }
  | { type: "error"; message: string };

export interface ChatMessageInput {
  role: string;
  content: string;
}

export interface UseChatConfig {
  model: string;
  systemPrompt?: string;
  /** Called to append a new message to the session */
  appendMessage: (msg: SessionMessage, sessionId: string) => Promise<void>;
  /** Called to update the last message in the session */
  updateLastMessage: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>;
  /** Called to finalize the last message (mark streaming=false) */
  finalizeMessage: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>;
}

/**
 * Core chat hook — handles streaming AI responses with SSE parsing.
 * Extracted from page.tsx to decouple UI from AI call logic.
 */
export function useChat(config: UseChatConfig) {
  const [streaming, setStreaming] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const streamStartRef = useRef<number | null>(null);

  // Streaming timer
  useEffect(() => {
    if (!streaming) {
      streamStartRef.current = null;
      setStreamElapsed(0);
      return;
    }
    streamStartRef.current = Date.now();
    const interval = setInterval(() => {
      if (streamStartRef.current) {
        setStreamElapsed(Math.round((Date.now() - streamStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [streaming]);

  // Abort on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  /** Send messages to the API and stream the response via SSE */
  const sendToAPI = useCallback(async (
    messages: ChatMessageInput[],
    sessionId: string,
    onCreateAssistant: (id: string) => void,
  ) => {
    const assistantId = crypto.randomUUID();
    const assistantMsg: SessionMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };
    await config.appendMessage(assistantMsg, sessionId);
    onCreateAssistant(assistantId);

    const abort = new AbortController();
    abortRef.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60_000);

    try {
      // Route Ollama models directly to the browser — server can't reach localhost
      if (config.model.startsWith("ollama/")) {
        await sendToOllama(messages, config.model, sessionId, abort, config);
        return;
      }

      const auth = getAuthConfig();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: config.model,
          wiki: true,
          systemPrompt: config.systemPrompt || undefined,
          ...auth,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try {
          const text = await res.text();
          const parsed = JSON.parse(text) as { error?: string };
          errMsg = parsed.error || errMsg;
        } catch { /* not JSON */ }
        await config.finalizeMessage({ content: errMsg, streaming: false }, sessionId);
        return;
      }

      // Parse SSE stream
      await parseSSEStream(res, sessionId, config.updateLastMessage, config.finalizeMessage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — leave whatever was streamed
        await config.finalizeMessage({ streaming: false }, sessionId);
      } else {
        await config.finalizeMessage({
          content: err instanceof Error ? err.message : "Unknown error",
          streaming: false,
          isError: true,
        }, sessionId);
      }
    } finally {
      clearTimeout(timeout);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [config]);

  const sendMessage = useCallback(async (
    messages: ChatMessageInput[],
    sessionId: string,
  ) => {
    if (streaming) return;
    setStreaming(true);
    await sendToAPI(messages, sessionId, () => {});
  }, [streaming, sendToAPI]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    streaming,
    streamElapsed,
    sendMessage,
    stop,
  };
}

/** Parse an SSE stream from a fetch Response, calling callbacks for each event */
async function parseSSEStream(
  res: Response,
  sessionId: string,
  onUpdate: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>,
  onFinalize: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>,
): Promise<void> {
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
            await onUpdate({ reasoning: currentReasoning }, sessionId);
            break;
          case "text":
            currentContent += event.content;
            await onUpdate({ content: currentContent }, sessionId);
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
            await onUpdate({ toolCalls: currentToolCalls }, sessionId);
            break;
          case "done":
            await onFinalize({
              content: currentContent || undefined,
              reasoning: currentReasoning || undefined,
              toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
              citations: event.citations,
              usage: event.usage,
              streaming: false,
            }, sessionId);
            break;
          case "error":
            const errorContent = currentContent
              ? `${currentContent}\n\n${event.message}`
              : event.message;
            await onFinalize({
              content: errorContent,
              streaming: false,
              isError: true,
            }, sessionId);
            break;
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }
}

/** Get auth config from localStorage (Ollama) — OpenRouter auth is via encrypted cookie */
export function getAuthConfig(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("origen_ollama_config");
  if (!stored) return {};
  try {
    const config = JSON.parse(stored);
    if (config.apiKey || config.baseUrl) return { ollamaBaseUrl: config.baseUrl || "https://ollama.com", ollamaApiKey: config.apiKey || "" };
    return {};
  } catch {
    return {};
  }
}

/** Get Ollama config (URL + API key) from localStorage */
function getOllamaConfig(): { url: string; apiKey: string } | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("origen_ollama_config");
  if (!stored) return null;
  try {
    const config = JSON.parse(stored);
    if (!config.apiKey) return null;
    return {
      url: (config.baseUrl || "https://ollama.com").replace(/\/+$/, ""),
      apiKey: config.apiKey,
    };
  } catch {
    return null;
  }
}

/** Send messages to Ollama Cloud API from the browser.
 *  Uses the cloud endpoint with Bearer auth — no CORS issues.
 */
async function sendToOllama(
  messages: ChatMessageInput[],
  model: string,
  sessionId: string,
  abort: AbortController,
  config: UseChatConfig,
): Promise<void> {
  const ollamaConfig = getOllamaConfig();
  if (!ollamaConfig) {
    await config.finalizeMessage({
      content: "Ollama not configured. Add your API key in Settings.",
      streaming: false,
      isError: true,
    }, sessionId);
    return;
  }

  // Strip ollama/ prefix to get the model name Ollama expects
  const ollamaModel = model.replace(/^ollama\//, "");

  const res = await fetch(`${ollamaConfig.url}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ollamaConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: ollamaModel,
      messages: config.systemPrompt
        ? [{ role: "system", content: config.systemPrompt }, ...messages]
        : messages,
      stream: true,
    }),
    signal: abort.signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    await config.finalizeMessage({
      content: `Ollama error (${res.status}): ${errText}`,
      streaming: false,
      isError: true,
    }, sessionId);
    return;
  }

  // Parse Ollama's NDJSON streaming format
  const reader = res.body?.getReader();
  if (!reader) {
    await config.finalizeMessage({ content: "No response body from Ollama", streaming: false, isError: true }, sessionId);
    return;
  }

  const decoder = new TextDecoder();
  let content = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (data.message?.content) {
            content += data.message.content;
            await config.updateLastMessage({ content }, sessionId);
          }
          if (data.done) {
            await config.finalizeMessage({ content, streaming: false }, sessionId);
            return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    // Stream ended without done=true
    await config.finalizeMessage({ content, streaming: false }, sessionId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      await config.finalizeMessage({ streaming: false }, sessionId);
    } else {
      await config.finalizeMessage({
        content: `Ollama stream error: ${err instanceof Error ? err.message : "Unknown"}`,
        streaming: false,
        isError: true,
      }, sessionId);
    }
  }
}