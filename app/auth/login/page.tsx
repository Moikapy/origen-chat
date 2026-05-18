"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
// CHAINS imported dynamically to avoid SSR issues with siwe/viem
const BASE_MAINNET = 8453;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "wallet_connecting">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendEmail = useCallback(async (emailAddress: string) => {
    setStatus("sending");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress.trim().toLowerCase() }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error || data.message || "Failed to send email"));
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setErrorMessage("No wallet detected. Install MetaMask or another Ethereum wallet.");
      return;
    }

    setStatus("wallet_connecting");
    setErrorMessage(null);

    try {
      // Request accounts
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.length) {
        setStatus("idle");
        setErrorMessage("No accounts found in wallet.");
        return;
      }

      const walletAddress = accounts[0];

      // Switch to Base if needed
      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" }) as string;
      const chainId = parseInt(chainIdHex, 16);

      if (chainId !== BASE_MAINNET) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${BASE_MAINNET.toString(16)}` }],
          });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: `0x${BASE_MAINNET.toString(16)}`,
                chainName: "Base",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"],
              }],
            });
          } else throw switchErr;
        }
      }

      // Get nonce
      const { nonce } = await fetch("/api/auth/wallet").then(r => r.json() as Promise<{ nonce: string }>);

      // Create and sign SIWE message
      const { createSiweMessage } = await import("@/lib/wallet");
      const domain = window.location.host;
      const message = createSiweMessage({ domain, address: walletAddress, chainId: BASE_MAINNET, nonce });
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      }) as string;

      // Verify with server
      const resp = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });

      const data = await resp.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "Wallet sign-in failed");

      // Success — redirect to home
      window.location.href = "/";
    } catch (err: any) {
      setStatus("idle");
      if (err.message?.includes("User rejected") || err.message?.includes("denied")) {
        setErrorMessage("Sign-in rejected.");
      } else {
        setErrorMessage(err.message || "Wallet sign-in failed");
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="mx-auto max-w-sm px-4 py-8">
        <div className="text-center mb-8">
          <Link href="/" className="text-lg font-semibold hover:opacity-80 transition-opacity">Origen Chat</Link>
          <p className="text-muted-foreground mt-2">Sign in to continue</p>
        </div>

        {status === "sent" ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">✉️</div>
            <p className="text-sm text-primary">Check your email for a sign-in link.</p>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected automatically after signing in.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Wallet sign-in */}
            <button
              onClick={connectWallet}
              disabled={status === "wallet_connecting"}
              className="w-full text-sm px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
                <rect x="1" y="5" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="14" cy="10.5" r="1.5" fill="currentColor" />
                <path d="M1 8h18" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
              </svg>
              {status === "wallet_connecting" ? "Connecting..." : "Sign in with Wallet"}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Email sign-in */}
            <form
              onSubmit={(e) => { e.preventDefault(); if (email.trim()) sendEmail(email); }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className="block text-sm mb-1">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                  disabled={status === "sending"}
                />
              </div>
              <button
                type="submit"
                disabled={status === "sending" || !email.trim()}
                className="w-full text-sm px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-colors disabled:opacity-30"
              >
                {status === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </div>
        )}

        {errorMessage && (
          <p className="text-sm text-destructive mt-4 text-center">{errorMessage}</p>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link href="/" className="hover:text-foreground transition-colors">← Back to chat</Link>
        </p>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}