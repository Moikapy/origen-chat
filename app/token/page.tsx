"use client";

import { useAuth } from "@/lib/auth";
import { WalletConnect } from "@/components/wallet-connect";
import { TokenLaunchForm, type TokenLaunchParams } from "@/components/token-launch-form";
import { RevenueDashboard } from "@/components/revenue-dashboard";
import { useState, useCallback } from "react";
import Link from "next/link";

export default function TokenPage() {
  const { user, loading } = useAuth();
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ ok: boolean; error?: string; tokenAddress?: string } | null>(null);

  const handleWalletConnected = useCallback((address: string) => {
    setWalletConnected(true);
    setWalletAddress(address);
  }, []);

  const handleLaunch = useCallback(async (params: TokenLaunchParams) => {
    setLaunching(true);
    setLaunchResult(null);
    try {
      // Full Flaunch SDK flow (coming in Phase 3):
      // 1. Create flaunchWrite with viem + walletClient
      // 2. Call flaunchWrite.flaunchIPFS({ name, symbol, ... })
      // 3. Parse poolCreatedData from tx hash
      // 4. POST to /api/token/launch to record in D1
      setLaunchResult({ ok: false, error: "On-chain launch via Flaunch SDK coming soon." });
    } catch (err) {
      setLaunchResult({ ok: false, error: err instanceof Error ? err.message : "Launch failed" });
    } finally {
      setLaunching(false);
    }
  }, []);

  if (loading) return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading…</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl">🪙</div>
          <h2 className="text-xl font-bold">Sign In to Launch a Token</h2>
          <p className="text-muted-foreground max-w-md">Create your own token on Base and earn ETH from trading fees. Free to sign up.</p>
          <Link href="/auth/login" className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-block">Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Token</h1>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Back to Settings</Link>
        </div>

        {/* Wallet */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Wallet</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{walletConnected ? `Connected: ${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)}` : "No wallet connected"}</p>
                <p className="text-sm text-muted-foreground">{walletConnected ? "Ready to launch tokens" : "Connect MetaMask to launch tokens on Base"}</p>
              </div>
              <WalletConnect onConnected={handleWalletConnected} />
            </div>
          </div>
        </section>

        {/* Revenue */}
        <section className="mb-10">
          <RevenueDashboard walletConnected={walletConnected} />
        </section>

        {/* Launch */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Launch New Token</h2>
            {walletConnected && !showForm && <button onClick={() => setShowForm(true)} className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">+ Launch Token</button>}
          </div>
          {showForm && walletConnected ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <TokenLaunchForm onSubmit={handleLaunch} loading={launching} />
              {launchResult && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${launchResult.ok ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                  {launchResult.ok ? `Token launched at ${launchResult.tokenAddress}` : launchResult.error}
                </div>
              )}
            </div>
          ) : !walletConnected ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-sm text-muted-foreground">Connect your wallet above to launch a token on Base.</p>
            </div>
          ) : null}
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">How It Works</h2>
          <div className="bg-muted/30 rounded-lg px-4 py-3 text-sm text-muted-foreground space-y-2">
            <p><span className="text-foreground font-medium">1. Launch:</span> Create token on Base — ~$0.01 gas</p>
            <p><span className="text-foreground font-medium">2. Trade:</span> Token enters price discovery on Uniswap V4</p>
            <p><span className="text-foreground font-medium">3. Earn:</span> Trading fees generate ETH — split between you and community</p>
            <p><span className="text-foreground font-medium">4. Convert:</span> ETH auto-converts to Origen credits</p>
            <p><span className="text-foreground font-medium">5. Compound:</span> More chat → better content → more trading → loop</p>
          </div>
        </section>
      </div>
    </div>
  );
}