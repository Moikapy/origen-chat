"use client";

import { useState } from "react";
import { checkAuth, type AuthCheckResult } from "@moikapy/origen";

interface AuthData {
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
}

export function ProviderSettings({ onClose }: { onClose: () => void }) {
  const [auth, setAuth] = useState<AuthData>(() => {
    if (typeof window === "undefined") return { provider: "openrouter", apiKey: "" };
    const stored = localStorage.getItem("origen_chat_auth");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch { /* ignore */ }
    }
    return { provider: "openrouter", apiKey: "" };
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AuthCheckResult | null>(null);

  const save = () => {
    localStorage.setItem("origen_chat_auth", JSON.stringify(auth));
    onClose();
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await checkAuth(async (provider: string) => {
        if (provider === auth.provider) return auth.apiKey;
        return undefined;
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        authenticated: false,
        apiKey: null,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card p-4 mb-4">
      <h3 className="text-sm font-semibold mb-3">Provider Settings</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Provider</label>
          <select
            value={auth.provider}
            onChange={(e) => setAuth({ ...auth, provider: e.target.value, apiKey: "" })}
            className="w-full bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 text-sm"
          >
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama Cloud</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            API Key {auth.provider === "ollama" ? "(Ollama Cloud)" : "(OpenRouter)"}
          </label>
          <input
            type="password"
            value={auth.apiKey}
            onChange={(e) => setAuth({ ...auth, apiKey: e.target.value })}
            placeholder={auth.provider === "ollama" ? "Ollama Cloud API key" : "sk-or-..."}
            className="w-full bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 text-sm"
          />
        </div>

        {auth.provider === "ollama" && (
          <div>
            <label className="text-xs text-muted-foreground">Endpoint</label>
            <input
              type="url"
              value={auth.ollamaBaseUrl ?? "https://api.ollama.com/v1"}
              onChange={(e) => setAuth({ ...auth, ollamaBaseUrl: e.target.value })}
              className="w-full bg-secondary text-secondary-foreground border border-border rounded-md px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={test}
          disabled={testing || !auth.apiKey}
          className="text-sm px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test Connection"}
        </button>
        <button
          onClick={save}
          disabled={!auth.apiKey}
          className="text-sm px-3 py-1 rounded bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onClose} className="text-sm px-3 py-1 text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      {testResult && (
        <div className={`mt-3 text-sm ${testResult.authenticated ? "text-primary" : "text-destructive"}`}>
          {testResult.authenticated
            ? `✓ Connected as ${testResult.provider}`
            : `✗ ${testResult.error}`}
        </div>
      )}
    </div>
  );
}