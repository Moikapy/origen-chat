"use client";

import { useAuth } from "@/lib/auth";
import { useMemory } from "@/lib/use-memory";
import { useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const { user, loading, openrouterConnected, connectOpenRouter, disconnectOpenRouter, logout } = useAuth();
  const { facts } = useMemory();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectOpenRouter();
    } finally {
      setDisconnecting(false);
    }
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
                      openrouterConnected
                        ? "bg-green-500/20 text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {openrouterConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {openrouterConnected
                    ? "Your OpenRouter API key is encrypted and stored securely. Use any model on your own key."
                    : "Connect your OpenRouter account to use any model — free and premium — on your own key."}
                </p>
              </div>
            </div>

            {openrouterConnected ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-muted/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground">Encrypted key stored</p>
                  <p className="text-xs text-muted-foreground">
                    BYOK: You pay OpenRouter directly. No credit usage on our end.
                  </p>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-sm px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <button
                onClick={connectOpenRouter}
                className="w-full text-sm px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
              >
                Connect OpenRouter
              </button>
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

        {/* Pro Upgrade (coming soon) */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Pro Features
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Origen Pro</p>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                Coming Soon
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>Pro unlocks advanced features on top of BYOK:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Unlimited memory (no 50-fact cap)</li>
                <li>Memory search across all conversations</li>
                <li>Custom personas and system prompt templates</li>
                <li>Image generation (DALL-E, Flux)</li>
                <li>Priority response queue</li>
                <li>Export conversations (Markdown, JSON)</li>
              </ul>
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