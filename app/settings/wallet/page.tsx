"use client";

import { useAuth } from "@/lib/auth";
import { WalletConnect } from "@/components/wallet-connect";
import { useState, useEffect } from "react";
import Link from "next/link";

interface WalletInfo {
  wallet_address: string;
  chain: string;
  wallet_type: string;
  is_primary: number;
  connected_at: number;
}

export default function WalletSettingsPage() {
  const { user, loading } = useAuth();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWalletLoading(false);
      return;
    }

    fetch("/api/payments/verify", { method: "GET" })
      .then((r) => r.json() as Promise<{ payments: any[] }>)
      .catch(() => ({ payments: [] }))
      .then(() => setWalletLoading(false));
  }, [user]);

  if (loading || walletLoading) {
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
          <p className="text-lg font-medium">Sign in to manage your wallet</p>
          <Link
            href="/auth/login"
            className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-block"
          >
            Sign In
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
          <h1 className="text-2xl font-bold">Wallet</h1>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Settings
          </Link>
        </div>

        {/* Connect Wallet */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Connect Wallet
          </h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <p className="text-sm text-muted-foreground mb-4">
              Connect a wallet to pay with USDC on Base, claim token revenue,
              or launch your own token.
            </p>
            <WalletConnect />
          </div>
        </section>

        {/* What you can do */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            What&apos;s Next
          </h2>
          <div className="space-y-3">
            <Link
              href="/settings/billing"
              className="block bg-card border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <p className="font-medium">Subscribe to Pro</p>
              <p className="text-sm text-muted-foreground">
                Pay with USDC on Base — $5/month for 2,000 credits
              </p>
            </Link>
            <Link
              href="/token"
              className="block bg-card border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <p className="font-medium">Launch a Token</p>
              <p className="text-sm text-muted-foreground">
                Create your own token on Base — earn ETH from trading fees
              </p>
            </Link>
          </div>
        </section>

        {/* Network Info */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Network
          </h2>
          <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground space-y-2">
            <p><span className="text-foreground font-medium">Chain:</span> Base (Ethereum L2)</p>
            <p><span className="text-foreground font-medium">Currency:</span> USDC</p>
            <p><span className="text-foreground font-medium">USDC Contract:</span> <code className="text-xs">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</code></p>
          </div>
        </section>
      </div>
    </div>
  );
}