"use client";

import { useAuth } from "@/lib/auth";
import { useState } from "react";
import Link from "next/link";
import { USDC_BASE_CONTRACT, PRO_PRICE_CENTS, CREDITS_PER_DOLLAR, PLATFORM_SPREAD } from "@/lib/crypto-payments";

export default function BillingPage() {
  const { user, loading } = useAuth();
  const [txHash, setTxHash] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleVerify = async () => {
    if (!txHash.trim()) return;
    setVerifying(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: txHash.trim(), type: "subscription" }) });
      const data = await res.json() as { ok: boolean; error?: string; creditsGranted?: number };
      if (!res.ok || !data.ok) { setError(data.error || "Verification failed"); return; }
      setSuccess(true); setTxHash("");
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) { setError(err instanceof Error ? err.message : "Verification failed"); }
    finally { setVerifying(false); }
  };

  if (loading) return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading…</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg font-medium">Sign in to subscribe</p>
          <Link href="/auth/login" className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-block">Sign In</Link>
        </div>
      </div>
    );
  }

  const proPriceUsd = (PRO_PRICE_CENTS / 100).toFixed(2);
  const proCredits = Math.floor(PRO_PRICE_CENTS * (1 - PLATFORM_SPREAD));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Billing</h1>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Back to Settings</Link>
        </div>

        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Origen Pro</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium">${proPriceUsd}/month</p>
                <p className="text-sm text-muted-foreground">{proCredits} credits/month</p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">Pay with USDC</span>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>✓ 2,000 credits/month (premium models)</p>
              <p>✓ Unlimited memory</p>
              <p>✓ Session sync across devices</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">How to Pay with USDC</h2>
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="text-sm space-y-3">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                <div><p className="font-medium">Connect your wallet</p><p className="text-muted-foreground">Go to <Link href="/settings/wallet" className="text-primary hover:underline">Wallet Settings</Link> and connect MetaMask</p></div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                <div><p className="font-medium">Send USDC to our treasury</p><p className="text-muted-foreground">Send <span className="text-foreground font-medium">${proPriceUsd} USDC</span> on Base</p></div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                <div><p className="font-medium">Paste your transaction hash below</p><p className="text-muted-foreground">We verify on-chain and activate your Pro</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Verify Payment</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="txHash">Transaction Hash</label>
              <input id="txHash" type="text" value={txHash} onChange={(e) => { setTxHash(e.target.value); setError(null); }} placeholder="0x..."
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono" disabled={verifying} />
              <button onClick={handleVerify} disabled={verifying || !txHash.trim()}
                className="w-full text-sm px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium disabled:opacity-50">
                {verifying ? "Verifying..." : "Verify & Activate Pro"}
              </button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-400">Payment verified! Activating Pro... Reloading...</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}