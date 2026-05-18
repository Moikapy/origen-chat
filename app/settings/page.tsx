"use client";

import { useAuth } from "@/lib/auth";
import { useMemory } from "@/lib/use-memory";
import { useState, useEffect } from "react";
import { useOllama } from "@/lib/use-ollama";
import Link from "next/link";

export default function SettingsPage() {
  const { user, loading, openrouterConnected, openrouterKeyValid, openrouterInfo, connectOpenRouter, disconnectOpenRouter, logout } = useAuth();
  const { facts } = useMemory();
  const [disconnecting, setDisconnecting] = useState(false);
  const [manualKey, setManualKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const { url: ollamaUrl, apiKey: ollamaApiKey, mode: ollamaMode, connected: ollamaConnected, models: ollamaModels, saveConfig: saveOllamaConfig, disconnect: disconnectOllama } = useOllama();
  const [ollamaUrlInput, setOllamaUrlInput] = useState("https://ollama.com");
  const [ollamaKeyInput, setOllamaKeyInput] = useState("");
  const [ollamaModeInput, setOllamaModeInput] = useState<"cloud" | "local">("cloud");
  const [ollamaSuccess, setOllamaSuccess] = useState(false);

  // Sync inputs with hook state on mount
  useEffect(() => {
    if (ollamaUrl) setOllamaUrlInput(ollamaUrl);
    if (ollamaApiKey) setOllamaKeyInput(ollamaApiKey);
    setOllamaModeInput(ollamaMode);
  }, [ollamaUrl, ollamaApiKey, ollamaMode]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectOpenRouter();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleManualKey = async () => {
    if (!manualKey.trim()) return;
    setSaving(true);
    setKeyError(null);
    setKeySuccess(false);
    try {
      const res = await fetch("/api/auth/set-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: manualKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to save key");
      }
      setManualKey("");
      setKeySuccess(true);
      // Refresh auth state
      window.location.reload();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOllama = () => {
    saveOllamaConfig(ollamaUrlInput, ollamaKeyInput, ollamaModeInput);
    setOllamaSuccess(true);
    setTimeout(() => setOllamaSuccess(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Link
            href="/chat"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Chat
          </Link>
        </div>

        {/* Account Section */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Account
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            {user ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{user.email}</p>
                  <p className="text-sm text-muted-foreground">Signed in</p>
                </div>
                <button
                  onClick={logout}
                  className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Not signed in</p>
                  <p className="text-sm text-muted-foreground">
                    Sign in to sync sessions and use premium features
                  </p>
                </div>
                <Link
                  href="/auth/login"
                  className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* OpenRouter Section */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            AI Provider
          </h2>
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">OpenRouter</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      openrouterKeyValid
                        ? "bg-green-500/20 text-green-400"
                        : openrouterConnected
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {openrouterKeyValid ? "Connected" : openrouterConnected ? "Stale key" : "Not connected"}
                  </span>
                </div>
                {openrouterConnected && !openrouterKeyValid && (
                  <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
                    <strong>⚠️ Key needs refresh</strong> — Your OpenRouter key can't be read. Please reconnect to continue using premium models.
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {openrouterKeyValid
                    ? "Your OpenRouter API key is encrypted and stored securely. Use any model on your own key."
                    : openrouterConnected
                      ? "Your OpenRouter session is stale. Reconnect to refresh your key."
                      : "Connect your OpenRouter account to use any model — free and premium — on your own key."}
                </p>
              </div>
            </div>

              {openrouterConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">Encrypted key stored</p>
                    <p className="text-xs text-muted-foreground">
                      BYOK: You pay OpenRouter directly
                    </p>
                    {openrouterInfo && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Balance</span>
                          <span className="text-foreground font-medium">${openrouterInfo.balance.toFixed(2)}</span>
                        </div>
                        {openrouterInfo.usageMonthly > 0 && (
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-muted-foreground">Usage this month</span>
                            <span className="text-foreground">${openrouterInfo.usageMonthly.toFixed(2)}</span>
                          </div>
                        )}
                        {openrouterInfo.usageDaily > 0 && (
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-muted-foreground">Usage today</span>
                            <span className="text-foreground">${openrouterInfo.usageDaily.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="text-sm px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Method 1: OAuth PKCE */}
                <button
                  onClick={connectOpenRouter}
                  className="w-full text-sm px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
                >
                  Connect with OpenRouter (OAuth)
                </button>

                {/* Method 2: Manual API key */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    Or paste your API key manually
                  </summary>
                  <div className="mt-2 space-y-2">
                    <input
                      type="password"
                      value={manualKey}
                      onChange={(e) => { setManualKey(e.target.value); setKeyError(null); setKeySuccess(false); }}
                      placeholder="sk-or-v1-..."
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      disabled={saving}
                    />
                    <button
                      onClick={handleManualKey}
                      disabled={saving || !manualKey.trim()}
                      className="w-full text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {saving ? "Encrypting..." : "Save API Key"}
                    </button>
                    {keyError && (
                      <p className="text-xs text-destructive">{keyError}</p>
                    )}
                    {keySuccess && (
                      <p className="text-xs text-green-400">Key saved! Reloading...</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Your key is encrypted (AES-256-GCM) before storage.
                      We never see or store your key in plaintext.
                      Get your key at{" "}
                      <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        openrouter.ai/settings/keys
                      </a>
                    </p>
                  </div>
                </details>
              </div>
            )}

            {/* BYOK explanation */}
            <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How BYOK works</p>
              <p>
                You authorize Origen Chat to use your OpenRouter account.
                Your API key is encrypted (AES-256-GCM) and stored in a cookie.
              </p>
              <p>
                <strong>You pay OpenRouter directly</strong> for any models you use.
                Free models (Gemma, Llama, DeepSeek) cost $0.
                Premium models (GPT-4o, Claude, etc.) are billed to your OpenRouter account.
              </p>
              <p>
                We never see or store your API key in plaintext.
                You can disconnect at any time.
              </p>
            </div>
          </div>
        </section>

        {/* Ollama Section */}
        <section className="mb-10">
          <div className="bg-card border border-border rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Ollama</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      ollamaConnected ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ollamaConnected ? "Connected" : "Not configured"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {ollamaConnected
                    ? `${ollamaModels.length} model${ollamaModels.length !== 1 ? "s" : ""} available`
                    : "Connect your Ollama instance."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Mode toggle: Cloud vs Local */}
              <div className="flex gap-2">
                <button
                  onClick={() => setOllamaModeInput("cloud")}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    ollamaModeInput === "cloud" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  Cloud
                </button>
                <button
                  onClick={() => setOllamaModeInput("local")}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    ollamaModeInput === "local" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  Local
                </button>
              </div>

              <label className="text-xs text-muted-foreground">API URL</label>
              <input
                type="url"
                value={ollamaModeInput === "local" ? (ollamaUrlInput || "http://localhost:11434") : ollamaUrlInput}
                onChange={(e) => setOllamaUrlInput(e.target.value)}
                placeholder={ollamaModeInput === "local" ? "http://localhost:11434" : "https://ollama.com"}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
              {ollamaModeInput === "cloud" && (
                <>
                  <label className="text-xs text-muted-foreground">API Key</label>
                  <input
                    type="password"
                    value={ollamaKeyInput}
                    onChange={(e) => setOllamaKeyInput(e.target.value)}
                    placeholder="your-ollama-api-key"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </>
              )}
              {ollamaModeInput === "local" && (
                <p className="text-xs text-muted-foreground">
                  Local Ollama requires <code className="bg-muted px-1 py-0.5 rounded text-[10px]">OLLAMA_ORIGINS=*</code> for browser access. Otherwise use Cloud mode.
                </p>
              )}
              <button
                onClick={handleSaveOllama}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Save
              </button>
              {ollamaSuccess && (
                <p className="text-xs text-green-400">Connected!</p>
              )}

              {ollamaConnected && (
                <button
                  onClick={disconnectOllama}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* Show available Ollama models */}
            {ollamaConnected && ollamaModels.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-xs font-medium text-foreground">Available models:</p>
                {ollamaModels.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1 text-xs">
                    <span className="font-mono">{m.name}</span>
                    <span className="text-muted-foreground">{m.sizeLabel}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs text-muted-foreground">
              <p>Cloud: use any Ollama model without running anything locally. Get an API key at <a href="https://ollama.com" target="_blank" rel="noopener" className="text-primary hover:underline">ollama.com</a>.</p>
              <p className="mt-1">Local: connect to Ollama on your machine. Zero cost, full privacy. Requires CORS setup.</p>
            </div>
          </div>
        </section>

        {/* Memory Section */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Memory
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Stored Facts</p>
                <p className="text-sm text-muted-foreground">
                  {facts.length} fact{facts.length !== 1 ? "s" : ""} remembered about you
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {user ? (user ? "100 fact limit" : "50 fact limit") : "Sign in for persistent memory"}
              </span>
            </div>
          </div>
        </section>

        {/* Pro Subscription — Coming Soon */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Pro
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Origen Pro</p>
                <p className="text-sm text-muted-foreground">
                  $12/month — unlimited memory, personas, search, image gen
                </p>
              </div>
              <span className="text-sm px-4 py-1.5 rounded-lg border border-border text-muted-foreground">
                Coming soon
              </span>
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Danger Zone
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <button
              onClick={async () => {
                if (confirm("This will clear all your stored memory. Are you sure?")) {
                  await fetch("/api/memory", { method: "DELETE" });
                  window.location.reload();
                }
              }}
              className="text-sm px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Clear all memory
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}