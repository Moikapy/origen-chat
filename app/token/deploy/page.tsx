"use client";

import { useState } from "react";
import Link from "next/link";

export default function DeployRevenueManagerPage() {
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; address?: string; error?: string; txHash?: string } | null>(null);

  const handleDeploy = async () => {
    if (!window.ethereum) {
      setResult({ ok: false, error: "No wallet detected. Install MetaMask." });
      return;
    }

    setDeploying(true);
    setResult(null);

    try {
      const { createPublicClient, createWalletClient, http, custom } = await import("viem");
      const { base } = await import("viem/chains");
      const { createFlaunch } = await import("@flaunch/sdk");

      // Switch to Base
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
      } catch (switchErr: any) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x2105", chainName: "Base", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }] });
        } else throw switchErr;
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const account = accounts[0];

      const publicClient = createPublicClient({ chain: base, transport: http() });
      const walletClient = createWalletClient({ account: account as `0x${string}`, chain: base, transport: custom(window.ethereum) });

      // Create read-write Flaunch SDK
      const flaunch = createFlaunch({ publicClient, walletClient } as any);

      // Deploy RevenueManager: 2.5% protocol fee to Origen treasury
      const txHash = await (flaunch as any).deployRevenueManager({
        protocolRecipient: "0x1fC5F441de0800d7e92f8d111C7e2f2AFe038c8C",
        protocolFeePercent: 2.5,
      });

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Parse the deployed address from logs
      // The RevenueManager address is emitted in the Deployment event
      // We need to find it in the receipt logs
      let deployedAddress = "";
      if (receipt.contractAddress && receipt.contractAddress !== "0x0000000000000000000000000000000000000000") {
        deployedAddress = receipt.contractAddress;
      } else {
        // Try to find the address from the tx logs
        for (const log of receipt.logs) {
          if (log.address && log.address !== "0x0000000000000000000000000000000000000000") {
            // The RevenueManager contract address will be in the logs
            deployedAddress = log.address;
            break;
          }
        }
      }

      setResult({
        ok: receipt.status === "success",
        address: deployedAddress || "Check tx on BaseScan",
        txHash,
      });
    } catch (err: any) {
      if (err.message?.includes("User rejected") || err.message?.includes("denied")) {
        setResult({ ok: false, error: "Transaction rejected by user." });
      } else {
        setResult({ ok: false, error: err.message || "Deploy failed" });
      }
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Deploy RevenueManager</h1>
          <Link href="/token" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Back to Token</Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div>
            <h2 className="font-medium mb-2">One-Time Setup</h2>
            <p className="text-sm text-muted-foreground">
              Deploy the Flaunch RevenueManager contract on Base. This sets up Origen&apos;s 2.5% protocol fee on all trading revenue from tokens launched through the platform. <strong>Only needs to be done once.</strong>
            </p>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Protocol Fee</span>
              <span className="font-medium">2.5%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treasury (Fee Recipient)</span>
              <span className="font-mono text-xs">0x1fC5F4...38c8C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Network</span>
              <span className="font-medium">Base (Chain ID 8453)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Gas</span>
              <span className="font-medium">~$0.05 USD</span>
            </div>
          </div>

          <div className="bg-yellow-500/10 text-yellow-400 rounded-lg p-3 text-sm">
            ⚠️ Connect MetaMask with the <strong>treasury wallet</strong> (0x1fC5F4...38c8C) before deploying. The deployer becomes the RevenueManager owner.
          </div>

          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full text-sm px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
          >
            {deploying ? "Deploying on Base..." : "🚀 Deploy RevenueManager"}
          </button>

          {result && (
            <div className={`rounded-lg p-4 text-sm ${result.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {result.ok ? (
                <div className="space-y-2">
                  <p className="font-medium">✅ RevenueManager deployed!</p>
                  <p>Address: <code className="text-xs break-all">{result.address}</code></p>
                  {result.txHash && (
                    <a
                      href={`https://basescan.org/tx/${result.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline text-xs"
                    >
                      View on BaseScan →
                    </a>
                  )}
                  <div className="border-t border-green-500/20 pt-2 mt-2">
                    <p className="text-xs">Next step: Set this address as <code>REVENUE_MANAGER_ADDRESS</code> in your Cloudflare Workers environment variables:</p>
                    <code className="block mt-1 text-xs bg-green-500/10 p-2 rounded break-all">
                      npx wrangler secret put REVENUE_MANAGER_ADDRESS
                    </code>
                    <p className="text-xs mt-1">Then enter: <code>{result.address}</code></p>
                  </div>
                </div>
              ) : (
                <p>{result.error}</p>
              )}
            </div>
          )}
        </div>
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