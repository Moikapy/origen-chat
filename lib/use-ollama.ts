/**
 * Ollama integration hook — supports cloud API (api key) and local instance.
 *
 * Cloud models route through /api/chat server-side (streamOrigen handles routing).
 * Local models go directly from browser to localhost:11434 (OpenAI-compatible /v1).
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
const CLOUD_URL = "https://ollama.com/v1";

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

  // Fetch models — cloud routes through server proxy (CORS), local goes direct to localhost
  const refreshModels = useCallback(async (configKey?: string, configUrl?: string, configMode?: "cloud" | "local") => {
    const key = configKey || apiKey;
    const configBaseUrl = (configUrl || url || CLOUD_URL).replace(/\/+$/, "");
    const m = configMode || mode;

    if (m === "cloud" && !key) {
      setModels([]);
      setConnected(false);
      return;
    }

    setLoading(true);
    try {
      let data: { data?: Array<{ id: string }>; models?: Array<{ name: string; size: number; modified_at: string }> };

      if (m === "cloud") {
        // Cloud: route through server proxy (browser can't hit ollama.com — CORS)
        const res = await fetch("/api/ollama-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: configBaseUrl, apiKey: key }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as typeof data;
      } else {
        // Local: direct browser request to localhost (no CORS issue)
        const headers: Record<string, string> = {};
        const res = await fetch(`${configBaseUrl}/models`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as typeof data;
      }

      // Handle both OpenAI-compatible format ({ data: [...] }) and native Ollama format ({ models: [...] })
      const ollamaModels = (data.models || (data.data || []).map(d => ({
        name: d.id,
        size: 0,
        modified_at: "",
      }))).map((m) => ({
        name: m.name,
        id: `ollama/${m.name}`,
        size: m.size,
        modified: m.modified_at,
        sizeLabel: m.size ? formatBytes(m.size) : "",
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
    const trimmedUrl = newUrl.trim().replace(/\/+$/, "") || (newMode === "local" ? "http://localhost:11434/v1" : CLOUD_URL);
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

  /** Test connection — cloud through server proxy, local direct */
  const testConnection = useCallback(async (testUrl?: string, testKey?: string, testMode?: "cloud" | "local"): Promise<{ ok: boolean; error?: string; models?: OllamaModel[] }> => {
    const baseUrl = (testUrl || url || CLOUD_URL).replace(/\/+$/, "");
    const key = testKey || apiKey;
    const m = testMode || mode;

    try {
      let res: Response;

      if (m === "cloud") {
        // Cloud: route through server proxy
        res = await fetch("/api/ollama-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl, apiKey: key }),
          signal: AbortSignal.timeout(12000),
        });
      } else {
        // Local: direct browser request to localhost
        const headers: Record<string, string> = {};
        res = await fetch(`${baseUrl}/models`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
      }

      if (res.ok) {
        const data = await res.json() as { data?: Array<{ id: string }>; models?: Array<{ name: string; size: number; modified_at: string }> };
        const found = (data.models || (data.data || []).map(d => ({
          name: d.id,
          size: 0,
          modified_at: "",
        }))).map((m) => ({
          name: m.name,
          id: `ollama/${m.name}` as const,
          size: m.size,
          modified: m.modified_at,
          sizeLabel: m.size ? formatBytes(m.size) : "",
        }));
        return { ok: true, models: found };
      }
      if (res.status === 401) return { ok: false, error: "Invalid API key" };
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        return { ok: false, error: m === "local"
          ? "Cannot reach local Ollama. Make sure Ollama is running on localhost:11434."
          : "Cannot reach Ollama Cloud. Try again or use Local mode." };
      }
      return { ok: false, error: msg };
    }
  }, [url, apiKey, mode]);

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