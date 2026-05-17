/**
 * Ollama integration hook — fetches models and handles client-side chat.
 *
 * Ollama runs on the user's machine (localhost:11434). Since the server
 * (Cloudflare Workers) can't reach localhost, we call Ollama directly
 * from the browser. This is also more private — no server in the middle.
 */
import { useState, useEffect, useCallback } from "react";

export interface OllamaModel {
  name: string;
  id: string;
  size: number;
  modified: string;
  /** Approx size in GB */
  sizeLabel: string;
}

const STORAGE_KEY = "ollama_url";

export function useOllama() {
  const [url, setUrlInternal] = useState<string>("");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load URL from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setUrlInternal(saved);
    }
  }, []);

  // Fetch models when URL is set
  const refreshModels = useCallback(async (ollamaUrl?: string) => {
    const baseUrl = (ollamaUrl || url || "").replace(/\/+$/, "");
    if (!baseUrl) {
      setModels([]);
      setConnected(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string }> };
      const ollamaModels = (data.models || []).map((m) => ({
        name: m.name,
        id: `ollama/${m.name}`,
        size: m.size,
        modified: m.modified_at,
        sizeLabel: formatBytes(m.size),
      }));
      setModels(ollamaModels);
      setConnected(true);
    } catch {
      setModels([]);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [url]);

  // Auto-fetch models when URL changes
  useEffect(() => {
    if (url) {
      refreshModels();
    }
  }, [url, refreshModels]);

  /** Save Ollama URL to localStorage */
  const saveUrl = useCallback((newUrl: string) => {
    const trimmed = newUrl.trim().replace(/\/+$/, "");
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUrlInternal(trimmed);

    // Also save in the format use-chat's getAuthConfig() reads
    const config = trimmed
      ? JSON.stringify({ baseUrl: trimmed, apiKey: "" })
      : "";
    if (config) {
      localStorage.setItem("origen_ollama_config", config);
    } else {
      localStorage.removeItem("origen_ollama_config");
    }
  }, []);

  /** Clear Ollama config */
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("origen_ollama_config");
    setUrlInternal("");
    setModels([]);
    setConnected(false);
  }, []);

  return {
    url,
    models,
    connected,
    loading,
    saveUrl,
    disconnect,
    refreshModels,
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}