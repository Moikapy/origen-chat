"use client";

import { useAuth } from "@/lib/auth";
import Link from "next/link";

export default function TokenPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl">🪙</div>
          <h2 className="text-xl font-bold">Sign In to Launch a Token</h2>
          <p className="text-muted-foreground max-w-md">
            Create your own token on Base and earn ETH from trading fees.
            It&apos;s free to sign up — just an email.
          </p>
          <Link
            href="/auth/login"
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-block"
          >
            Sign In with Email
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Launch a Token</h1>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Settings
          </Link>
        </div>

        {/* Coming Soon */}
        <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
          <div className="text-5xl">🚀</div>
          <h2 className="text-xl font-bold">Token Launch Coming Soon</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Create your own token on Base with Flaunch. Earn ETH from trading fees,
            set your creator revenue split, and watch your community grow.
          </p>
          <div className="bg-muted/30 rounded-lg px-4 py-3 text-sm text-muted-foreground text-left max-w-md mx-auto space-y-2">
            <p className="font-medium text-foreground">How it works:</p>
            <p>1. Choose a name, symbol, and initial market cap</p>
            <p>2. Set your creator revenue percentage</p>
            <p>3. Launch on Base — trading fees flow to your wallet in ETH</p>
            <p>4. Auto-convert ETH to Origen credits to fund premium chat</p>
          </div>

          <div className="flex gap-3 justify-center pt-4">
            <Link
              href="/settings/wallet"
              className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Connect Wallet
            </Link>
            <Link
              href="/settings"
              className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Back to Settings
            </Link>
          </div>
        </div>

        {/* Token Benefits */}
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Why Launch a Token?
          </h2>
          <div className="grid gap-3">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-medium">💰 Earn ETH from Trading</p>
              <p className="text-sm text-muted-foreground">
                Every trade on your token generates ETH revenue — paid directly to your wallet.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-medium">🤖 Auto-Fund Your Chat</p>
              <p className="text-sm text-muted-foreground">
                Token revenue auto-converts to Origen credits. Your community funds your AI usage.
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="font-medium">🔒 Fair Launch Mechanics</p>
              <p className="text-sm text-muted-foreground">
                Flaunch&apos;s fixed-price fair launch removes sniper advantage and protects your community.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}