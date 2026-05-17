/**
 * Ollama Cloud integration hook — connects to Ollama's cloud API.
 *
 * Default: https://ollama.com/api with API key auth.
 * No localhost, no CORS issues — cloud-first approach.
 * Local Ollama support will come via a future TUI tool.
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

const STORAGE_KEY = "origen_ollama_config";
const CLOUD_URL = "https://ollama.com";

export function useOllama() {
  const [url, setUrlInternal] = useState<string>("");
  const [apiKey, setApiKeyInternal] = useState<string>("");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const config = JSON.parse(stored);
        if (config.apiKey) {
          setUrlInternal(config.baseUrl || CLOUD_URL);
          setApiKeyInternal(config.apiKey);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Fetch models when we have an API key
  const refreshModels = useCallback(async (configKey?: string) => {
    const key = configKey || apiKey;
    if (!key) {
      setModels([]);
      setConnected(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${url || CLOUD_URL}/api/tags`, {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
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
  }, [apiKey, url]);

  // Auto-fetch models when API key is set
  useEffect(() => {
    if (apiKey) {
      refreshModels();
    }
  }, [apiKey, refreshModels]);

  /** Save Ollama config to localStorage */
  const saveConfig = useCallback((newUrl: string, newApiKey: string) => {
    const trimmedUrl = newUrl.trim().replace(/\/+$/, "") || CLOUD_URL;
    const trimmedKey = newApiKey.trim();

    if (trimmedKey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        baseUrl: trimmedUrl,
        apiKey: trimmedKey,
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    setUrlInternal(trimmedUrl);
    setApiKeyInternal(trimmedKey);
  }, []);

  /** Clear Ollama config */
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUrlInternal("");
    setApiKeyInternal("");
    setModels([]);
    setConnected(false);
  }, []);

  /** Test connection and return detailed status */
  const testConnection = useCallback(async (testUrl?: string, testKey?: string): Promise<{ ok: boolean; error?: string }> => {
    const baseUrl = (testUrl || url || CLOUD_URL).replace(/\/+$/, "");
    const key = testKey || apiKey;
    if (!key) return { ok: false, error: "API key required" };

    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { ok: true };
      if (res.status === 401) return { ok: false, error: "Invalid API key" };
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: msg };
    }
  }, [url, apiKey]);

  return {
    url,
    apiKey,
    models,
    connected,
    loading,
    saveConfig,
    disconnect,
    refreshModels,
    testConnection,
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}