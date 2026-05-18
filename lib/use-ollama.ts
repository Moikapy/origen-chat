/**
 * Ollama integration hook — supports cloud API (api key) and local instance.
 *
 * Cloud: https://ollama.com with Bearer token
 * Local: http://localhost:11434 (no auth, but may have CORS issues from browser)
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

export interface OllamaConfig {
  baseUrl: string;
  apiKey: string;
  mode: "cloud" | "local";
}

export function useOllama() {
  const [url, setUrlInternal] = useState<string>("");
  const [apiKey, setApiKeyInternal] = useState<string>("");
  const [mode, setMode] = useState<"cloud" | "local">("cloud");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const config = JSON.parse(stored) as OllamaConfig;
        setUrlInternal(config.baseUrl || CLOUD_URL);
        setApiKeyInternal(config.apiKey || "");
        setMode(config.mode || "cloud");
      } catch {
        // ignore
      }
    }
  }, []);

  // Fetch models when config is set
  const refreshModels = useCallback(async (configKey?: string, configUrl?: string, configMode?: "cloud" | "local") => {
    const key = configKey || apiKey;
    const baseUrl = (configUrl || url || CLOUD_URL).replace(/\/+$/, "");
    const m = configMode || mode;

    if (m === "cloud" && !key) {
      setModels([]);
      setConnected(false);
      return;
    }

    setLoading(true);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Cloud mode: proxy through our API to avoid CORS issues
    // Local mode: call Ollama directly (requires OLLAMA_ORIGINS=*)
    const fetchUrl = m === "cloud"
      ? "/api/ollama-proxy"
      : `${baseUrl}/api/tags`;
    const fetchBody = m === "cloud"
      ? JSON.stringify({ path: "/api/tags", method: "GET", apiKey: key })
      : undefined;
    if (key) headers["Authorization"] = `Bearer ${key}`;

    try {
      const res = await fetch(fetchUrl, {
        method: m === "cloud" ? "POST" : "GET",
        headers,
        body: fetchBody,
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
  }, [apiKey, url, mode]);

  // Auto-fetch models when API key or mode changes
  useEffect(() => {
    if (mode === "cloud" && apiKey) {
      refreshModels();
    } else if (mode === "local") {
      refreshModels();
    }
  }, [apiKey, mode, refreshModels]);

  /** Save Ollama config to localStorage */
  const saveConfig = useCallback((newUrl: string, newApiKey: string, newMode: "cloud" | "local") => {
    const trimmedUrl = newUrl.trim().replace(/\/+$/, "") || (newMode === "local" ? "http://localhost:11434" : CLOUD_URL);
    const trimmedKey = newApiKey.trim();

    const config: OllamaConfig = { baseUrl: trimmedUrl, apiKey: trimmedKey, mode: newMode };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    setUrlInternal(trimmedUrl);
    setApiKeyInternal(trimmedKey);
    setMode(newMode);
  }, []);

  /** Clear Ollama config */
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUrlInternal("");
    setApiKeyInternal("");
    setMode("cloud");
    setModels([]);
    setConnected(false);
  }, []);

  /** Test connection and return detailed status */
  const testConnection = useCallback(async (testUrl?: string, testKey?: string): Promise<{ ok: boolean; error?: string; models?: OllamaModel[] }> => {
    const baseUrl = (testUrl || url || CLOUD_URL).replace(/\/+$/, "");
    const key = testKey || apiKey;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;

    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string }> };
        const found = (data.models || []).map((m) => ({
          name: m.name,
          id: `ollama/${m.name}` as const,
          size: m.size,
          modified: m.modified_at,
          sizeLabel: formatBytes(m.size),
        }));
        return { ok: true, models: found };
      }
      if (res.status === 401) return { ok: false, error: "Invalid API key" };
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        return { ok: false, error: "Cannot reach Ollama. If using localhost, set OLLAMA_ORIGINS=* or use Cloud mode." };
      }
      return { ok: false, error: msg };
    }
  }, [url, apiKey]);

  return {
    url,
    apiKey,
    mode,
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