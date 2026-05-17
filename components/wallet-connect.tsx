"use client";

import { useState, useCallback } from "react";
import { createSiweMessage, CHAINS } from "@/lib/wallet";

interface WalletConnectProps {
  onConnected?: (address: string, chainId: number) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function WalletConnect({ onConnected, onError, className }: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      if (!window.ethereum) { onError?.("No wallet detected. Install MetaMask."); return; }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.length) { onError?.("No accounts found."); return; }
      const walletAddress = accounts[0];
      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" }) as string;
      const chainId = parseInt(chainIdHex, 16);

      // Switch to Base if needed
      if (chainId !== CHAINS.BASE_MAINNET) {
        try {
          await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAINS.BASE_MAINNET.toString(16)}` }] });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
              chainId: `0x${CHAINS.BASE_MAINNET.toString(16)}`,
              chainName: "Base",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            }] });
          } else throw switchErr;
        }
      }

      // SIWE sign-in
      const { nonce } = await fetch("/api/auth/wallet/nonce").then(r => r.json() as Promise<{ nonce: string }>);
      const domain = window.location.host;
      const message = createSiweMessage({ domain, address: walletAddress, chainId, nonce });
      const signature = await window.ethereum.request({ method: "personal_sign", params: [message, walletAddress] }) as string;

      const resp = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const data = await resp.json() as { ok: boolean; walletAddress?: string; error?: string };
      if (!data.ok) { onError?.(data.error || "Wallet sign-in failed."); return; }

      setAddress(data.walletAddress || walletAddress);
      onConnected?.(data.walletAddress || walletAddress, chainId);
      window.location.reload();
    } catch (err: any) {
      onError?.(err.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [onConnected, onError]);

  const disconnect = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAddress(null);
    window.location.reload();
  }, []);

  if (address) {
    return (
      <div className={`flex items-center gap-3 ${className || ""}`}>
        <span className="text-sm text-muted-foreground">{address.slice(0, 6)}...{address.slice(-4)}</span>
        <button onClick={disconnect} className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} disabled={connecting}
      className={`text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 ${className || ""}`}>
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}