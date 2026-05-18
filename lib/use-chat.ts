"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { SessionMessage } from "@/lib/session-store";

// ── Types ──────────────────────────────────────────────────────────

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
  appendMessage: (msg: SessionMessage, sessionId: string) => Promise<void>;
  updateLastMessage: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>;
  finalizeMessage: (updates: Partial<SessionMessage>, sessionId: string) => Promise<void>;
}

// ── Ollama config (single source of truth) ─────────────────────────

const OLLAMA_STORAGE_KEY = "origen_ollama_config";

export interface OllamaConfig {
  baseUrl: string;
  apiKey: string;
  mode: "cloud" | "local";
}

/** Read Ollama config from localStorage. Returns null if not configured. */
export function getOllamaConfig(): OllamaConfig | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(OLLAMA_STORAGE_KEY);
  if (!stored) return null;
  try {
    const config = JSON.parse(stored);
    if (config.mode === "local") {
      return {
        baseUrl: (config.baseUrl || "http://localhost:11434/v1").replace(/\/+$/, ""),
        apiKey: "",
        mode: "local",
      };
    }
    if (!config.apiKey) return null;
    return {
      baseUrl: (config.baseUrl || "https://ollama.com/v1").replace(/\/+$/, ""),
      apiKey: config.apiKey,
      mode: "cloud",
    };
  } catch {
    return null;
  }
}

// ── Chat hook ──────────────────────────────────────────────────────

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
      const ollama = getOllamaConfig();
      const isOllamaModel = config.model.startsWith("ollama/");

      // Local Ollama: browser calls ollama directly (server can't reach localhost)
      if (isOllamaModel && ollama?.mode === "local") {
        await sendToLocalOllama(messages, config.model, sessionId, abort, config, ollama);
        return;
      }

      // Build request body — only include Ollama params for Ollama models
      const body: Record<string, unknown> = {
        messages,
        model: config.model,
        wiki: true,
      };
      if (config.systemPrompt) body.systemPrompt = config.systemPrompt;

      if (isOllamaModel && ollama?.mode === "cloud") {
        body.ollamaBaseUrl = "https://ollama.com/v1";
        body.ollamaApiKey = ollama.apiKey;
      }
      // For non-Ollama models: no Ollama params needed.
      // OpenRouter auth comes from encrypted cookies (server-side).

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

      await parseSSEStream(res, sessionId, config.updateLastMessage, config.finalizeMessage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
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

  return { streaming, streamElapsed, sendMessage, stop };
}

// ── SSE parser ─────────────────────────────────────────────────────

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
          case "error": {
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
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }
}

// ── Local Ollama sender ────────────────────────────────────────────

async function sendToLocalOllama(
  messages: ChatMessageInput[],
  model: string,
  sessionId: string,
  abort: AbortController,
  config: UseChatConfig,
  ollama: OllamaConfig,
): Promise<void> {
  const ollamaModel = model.replace(/^ollama\//, "");
  const baseUrl = ollama.baseUrl.replace(/\/+$/, "");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ollama.apiKey) headers["Authorization"] = `Bearer ${ollama.apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
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

  await parseSSEStream(res, sessionId, config.updateLastMessage, config.finalizeMessage);
}