"use client";

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
      const auth = getAuthConfig();
      const ollamaConfig = getOllamaConfig();

      // Route local Ollama models directly from the browser.
      // The server (Cloudflare Workers) can't reach localhost:11434.
      // Cloud Ollama models go through /api/chat like everything else.
      if (config.model.startsWith("ollama/") && ollamaConfig?.mode === "local") {
        await sendToLocalOllama(messages, config.model, sessionId, abort, config, ollamaConfig);
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model: config.model,
          wiki: true,
          systemPrompt: config.systemPrompt || undefined,
          // For cloud Ollama, pass the API key and base URL so the server routes correctly
          ...(ollamaConfig?.mode === "cloud" ? {
            ollamaBaseUrl: "https://ollama.com/v1",
            ollamaApiKey: ollamaConfig.apiKey,
          } : auth),
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
    if (config.apiKey || config.baseUrl) return { ollamaBaseUrl: config.baseUrl || "https://ollama.com/v1", ollamaApiKey: config.apiKey || "" };
    return {};
  } catch {
    return {};
  }
}

/** Get Ollama config (URL + API key + mode) from localStorage */
export function getOllamaConfig(): { url: string; apiKey: string; mode: string } | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("origen_ollama_config");
  if (!stored) return null;
  try {
    const config = JSON.parse(stored);
    // Cloud mode requires API key; local mode works without
    if (config.mode === "local") {
      const baseUrl = (config.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
      return { url: baseUrl, apiKey: "", mode: "local" };
    }
    if (!config.apiKey) return null;
    return {
      url: (config.baseUrl || "https://ollama.com/v1").replace(/\/+$/, ""),
      apiKey: config.apiKey,
      mode: "cloud",
    };
  } catch {
    return null;
  }
}

/** Send messages to local Ollama directly from the browser.
 *  Uses the OpenAI-compatible /v1/chat/completions endpoint with SSE streaming
 *  so the response format matches what parseSSEStream expects.
 *  Cloud Ollama routes through /api/chat (handled server-side by streamOrigen).
 */
async function sendToLocalOllama(
  messages: ChatMessageInput[],
  model: string,
  sessionId: string,
  abort: AbortController,
  config: UseChatConfig,
  ollamaConfig: { url: string; apiKey: string },
): Promise<void> {
  // Strip ollama/ prefix to get the model name Ollama expects
  const ollamaModel = model.replace(/^ollama\//, "");
  const baseUrl = ollamaConfig.url.replace(/\/+$/, "");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ollamaConfig.apiKey) {
    headers["Authorization"] = `Bearer ${ollamaConfig.apiKey}`;
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
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
    let errMsg = `Ollama error (${res.status})`;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text);
      errMsg = parsed.error?.message || parsed.error || errMsg;
    } catch { /* not JSON */ }
    await config.finalizeMessage({ content: errMsg, streaming: false, isError: true }, sessionId);
    return;
  }

  // Parse the SSE stream — OpenAI-compatible format yields the same events as /api/chat
  await parseSSEStream(res, sessionId, config.updateLastMessage, config.finalizeMessage);
}