"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface OllamaConfig {
  baseUrl: string;
  apiKey: string;
}

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>({
    baseUrl: "https://api.ollama.com/v1",
    apiKey: "",
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("origen_ollama_config");
    if (stored) {
      try { setOllamaConfig(JSON.parse(stored)); }
      catch { /* ignore */ }
    }
  }, []);

  // Redirect to login if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-pulse h-2 w-2 rounded-full bg-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg">Sign in to access settings</p>
          <Link href="/auth/login" className="inline-block text-sm px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const saveOllama = () => {
    localStorage.setItem("origen_ollama_config", JSON.stringify(ollamaConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testOllama = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${ollamaConfig.baseUrl}/models`, {
        headers: ollamaConfig.apiKey ? { Authorization: `Bearer ${ollamaConfig.apiKey}` } : {},
      });
      setTestResult(res.ok
        ? { ok: true, msg: `✓ Connected (${res.status})` }
        : { ok: false, msg: `✗ ${res.status}: ${res.statusText}` }
      );
    } catch (err) {
      setTestResult({ ok: false, msg: `✗ ${err instanceof Error ? err.message : "Connection failed"}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/chat" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
            ← Back
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Account</h2>
            <p className="text-sm">
              ✅ Signed in as <span className="font-medium">{user.email}</span>
            </p>
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              Sign out
            </button>
          </div>

          <div className="border-t border-border" />

          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Ollama Cloud</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Endpoint</label>
                <input
                  type="url"
                  value={ollamaConfig.baseUrl}
                  onChange={(e) => setOllamaConfig({ ...ollamaConfig, baseUrl: e.target.value })}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">API Key (optional)</label>
                <input
                  type="password"
                  value={ollamaConfig.apiKey}
                  onChange={(e) => setOllamaConfig({ ...ollamaConfig, apiKey: e.target.value })}
                  placeholder="Ollama Cloud API key"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={testOllama}
                  disabled={testing}
                  className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-40"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                  onClick={saveOllama}
                  className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                >
                  {saved ? "Saved ✓" : "Save"}
                </button>
              </div>
              {testResult && (
                <p className={`text-sm mt-1 ${testResult.ok ? "text-primary" : "text-destructive"}`}>
                  {testResult.msg}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}