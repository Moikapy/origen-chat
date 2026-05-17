"use client";

import { useAuth } from "@/lib/auth";
import { WalletConnect } from "@/components/wallet-connect";
import { TokenLaunchForm, type TokenLaunchParams } from "@/components/token-launch-form";
import { RevenueDashboard } from "@/components/revenue-dashboard";
import {
  createFlaunchReadWrite,
  createFlaunchRead,
  launchToken,
  parseLaunchResult,
  fileToBase64Image,
  getRevenueManagerAddress,
  setRevenueManagerAddress,
  ORIGEN_TREASURY,
} from "@/lib/flaunch";
import { useState, useCallback } from "react";
import Link from "next/link";

// Base chain config — we define it inline to avoid viem/chains version mismatch with @flaunch/sdk
const BASE_CHAIN_ID = 8453;

export default function TokenPage() {
  const { user, loading } = useAuth();
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [launchResult, setLaunchResult] = useState<{
    ok: boolean;
    error?: string;
    tokenAddress?: string;
    txHash?: string;
  } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleWalletConnected = useCallback((address: string) => {
    setWalletConnected(true);
    setWalletAddress(address);
  }, []);

  const handleImageChange = useCallback((file: File | null) => {
    setImageFile(file);
  }, []);

  const handleLaunch = useCallback(
    async (params: TokenLaunchParams) => {
      if (!walletAddress || !window.ethereum) {
        setLaunchResult({ ok: false, error: "Connect your wallet first." });
        return;
      }

      setLaunching(true);
      setLaunchResult(null);

      try {
        // Dynamically import viem to avoid SSR issues
        const { createPublicClient, createWalletClient, http, custom } = await import("viem");
        const { base } = await import("viem/chains");

        // 1. Create viem clients from MetaMask
        const publicClient = createPublicClient({
          chain: base,
          transport: http(),
        });
        const walletClient = createWalletClient({
          account: walletAddress as `0x${string}`,
          chain: base,
          transport: custom(window.ethereum!),
        });

        // 2. Create Flaunch SDK read+write instance
        const flaunchWrite = createFlaunchReadWrite(publicClient as any, walletClient as any);
        const flaunchRead = createFlaunchRead(publicClient as any);

        // 3. Resolve RevenueManager address
        let revenueManagerAddr = getRevenueManagerAddress();
        if (!revenueManagerAddr) {
          const resp = await fetch("/api/token/config");
          if (resp.ok) {
            const config = (await resp.json()) as { revenueManagerAddress?: string };
            if (config.revenueManagerAddress) {
              setRevenueManagerAddress(config.revenueManagerAddress);
              revenueManagerAddr = config.revenueManagerAddress;
            }
          }
        }

        if (!revenueManagerAddr) {
          setLaunchResult({ ok: false, error: "RevenueManager not configured. Contact support." });
          return;
        }

        // 4. Convert image to base64
        let base64Image = "";
        if (imageFile) {
          base64Image = await fileToBase64Image(imageFile);
        } else {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#10b981" rx="128"/><text x="128" y="160" text-anchor="middle" fill="white" font-size="96" font-family="sans-serif">${params.symbol.charAt(0)}</text></svg>`;
          base64Image = `data:image/svg+xml;base64,${btoa(svg)}`;
        }

        // 5. Launch token on Flaunch
        const txHash = await launchToken(flaunchWrite, walletAddress, {
          name: params.name,
          symbol: params.symbol,
          description: params.description,
          initialMarketCapUSD: params.initialMarketCapUSD,
          creatorFeeAllocationPercent: params.creatorFeeAllocationPercent,
          fairLaunchPercent: params.fairLaunchPercent,
          fairLaunchDuration: params.fairLaunchDuration,
          base64Image,
          websiteUrl: params.websiteUrl,
          twitterUrl: params.twitterUrl,
          telegramUrl: params.telegramUrl,
        });

        // 6. Wait for tx confirmation and parse result
        const receipt = await (publicClient as any).waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
          setLaunchResult({ ok: false, error: "Transaction reverted on-chain.", txHash });
          return;
        }

        const parsed = await parseLaunchResult(flaunchRead, txHash);
        if (!parsed) {
          setLaunchResult({ ok: false, error: "Token launched but couldn't parse result. Check transaction.", txHash });
          return;
        }

        // 7. Record the token in D1
        const recordResp = await fetch("/api/token/revenue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenAddress: parsed.tokenAddress,
            tokenName: params.name,
            tokenSymbol: params.symbol,
            revenueManagerAddress: revenueManagerAddr,
            initialMarketCapUsdc: params.initialMarketCapUSD,
            creatorRevenueBps: params.creatorFeeAllocationPercent * 100,
            protocolFeeBps: 250,
            launchTxHash: txHash,
          }),
        });

        if (!recordResp.ok) {
          const err = (await recordResp.json()) as { error?: string };
          setLaunchResult({
            ok: true,
            error: `Token launched but recording failed: ${err.error}. Tx: ${txHash}`,
            tokenAddress: parsed.tokenAddress,
            txHash,
          });
          return;
        }

        setLaunchResult({ ok: true, tokenAddress: parsed.tokenAddress, txHash });

        // Refresh to show new token in dashboard
        setTimeout(() => window.location.reload(), 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Launch failed";
        if (message.includes("User rejected") || message.includes("denied")) {
          setLaunchResult({ ok: false, error: "Transaction rejected by user." });
        } else {
          setLaunchResult({ ok: false, error: message });
        }
      } finally {
        setLaunching(false);
      }
    },
    [walletAddress, imageFile],
  );

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
            Free to sign up.
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
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Token</h1>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Settings
          </Link>
        </div>

        {/* Wallet */}
        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Wallet</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {walletConnected
                    ? `Connected: ${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)}`
                    : "No wallet connected"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {walletConnected ? "Ready to launch tokens on Base" : "Connect MetaMask to launch tokens on Base"}
                </p>
              </div>
              <WalletConnect onConnected={handleWalletConnected} />
            </div>
          </div>
        </section>

        {/* Revenue */}
        <section className="mb-10">
          <RevenueDashboard walletConnected={walletConnected} walletAddress={walletAddress || undefined} />
        </section>

        {/* Launch */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Launch New Token</h2>
            {walletConnected && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                + Launch Token
              </button>
            )}
          </div>

          {showForm && walletConnected ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <TokenLaunchForm onSubmit={handleLaunch} loading={launching} onImageChange={handleImageChange} />
              {launchResult && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  launchResult.ok
                    ? "bg-green-500/10 text-green-400"
                    : launchResult.txHash
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-red-500/10 text-red-400"
                }`}>
                  {launchResult.ok ? (
                    <>
                      ✅ Token launched!{" "}
                      <a href={`https://basescan.org/address/${launchResult.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                        {launchResult.tokenAddress?.slice(0, 10)}...{launchResult.tokenAddress?.slice(-6)}
                      </a>
                      {launchResult.txHash && (
                        <> · <a href={`https://basescan.org/tx/${launchResult.txHash}`} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">View tx</a></>
                      )}
                    </>
                  ) : (
                    launchResult.error
                  )}
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

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}