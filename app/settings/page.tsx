"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AuthData {
  provider: string;
  apiKey: string;
  ollamaBaseUrl?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthData>(() => {
    if (typeof window === "undefined") return { provider: "openrouter", apiKey: "" };
    const stored = localStorage.getItem("origen_chat_auth");
    if (stored) {
      try { return JSON.parse(stored); }
      catch { /* ignore */ }
    }
    return { provider: "openrouter", apiKey: "" };
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem("origen_chat_auth", JSON.stringify(auth));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const baseUrl = auth.provider === "ollama"
        ? (auth.ollamaBaseUrl || "https://api.ollama.com/v1")
        : "https://openrouter.ai/api/v1";

      const res = await fetch(`${baseUrl}/models`, {
        headers: auth.provider === "openrouter"
          ? { Authorization: `Bearer ${auth.apiKey}` }
          : {},
      });

      if (res.ok) {
        setTestResult({ ok: true, msg: `✓ Connected to ${auth.provider}` });
      } else {
        setTestResult({ ok: false, msg: `✗ ${res.status}: ${res.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `✗ ${err instanceof Error ? err.message : "Connection failed"}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/")}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        {/* Provider section */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Provider</h2>

          <div>
            <label className="block text-sm mb-1">Provider</label>
            <select
              value={auth.provider}
              onChange={(e) => setAuth({ ...auth, provider: e.target.value, apiKey: "" })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama Cloud</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">
              API Key
            </label>
            <input
              type="password"
              value={auth.apiKey}
              onChange={(e) => { setAuth({ ...auth, apiKey: e.target.value }); setSaved(false); }}
              placeholder={auth.provider === "ollama" ? "Ollama Cloud API key" : "sk-or-..."}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
            />
          </div>

          {auth.provider === "ollama" && (
            <div>
              <label className="block text-sm mb-1">Endpoint</label>
              <input
                type="url"
                value={auth.ollamaBaseUrl ?? "https://api.ollama.com/v1"}
                onChange={(e) => setAuth({ ...auth, ollamaBaseUrl: e.target.value })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={test}
              disabled={testing || !auth.apiKey}
              className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-40"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>

            <button
              onClick={save}
              disabled={!auth.apiKey}
              className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-40"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>

          {testResult && (
            <p className={`text-sm mt-2 ${testResult.ok ? "text-primary" : "text-destructive"}`}>
              {testResult.msg}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}